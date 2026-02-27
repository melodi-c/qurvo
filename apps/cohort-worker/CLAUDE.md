# Cohort Worker App

NestJS background worker. No HTTP server. Periodically recomputes dynamic cohort memberships.

## Commands

```bash
pnpm --filter @qurvo/cohort-worker dev          # watch mode
pnpm --filter @qurvo/cohort-worker build        # nest build → dist/
pnpm --filter @qurvo/cohort-worker start        # node dist/main.js

# Integration tests (testcontainers — no manual infra needed)
pnpm --filter @qurvo/cohort-worker exec vitest run --config vitest.integration.config.ts
```

## Architecture

```
src/
├── app.module.ts                        # Root: workerLoggerModule() + CohortWorkerModule
├── main.ts                              # bootstrapWorker() from @qurvo/worker-core (env validation, no HTTP)
├── constants.ts                         # Cohort interval, backoff, lock config, Bull queue config
├── tracer.ts                            # Datadog APM init (imported first in main.ts)
├── cohort-worker/
│   ├── tokens.ts                        # DI tokens: DISTRIBUTED_LOCK, COMPUTE_QUEUE_EVENTS
│   ├── cohort-worker.module.ts          # BullModule + providers from @qurvo/nestjs-infra + services
│   ├── cohort-computation.service.ts    # CH/PG operations for individual cohorts
│   ├── cohort-membership.service.ts     # Cycle orchestration (extends PeriodicWorkerMixin): lock, backoff, Bull dispatch
│   ├── cohort-compute.processor.ts      # Bull worker: per-cohort parallel computation
│   └── shutdown.service.ts              # Graceful shutdown: stops service, closes QueueEvents + CH + PG + Redis
└── test/
    ├── setup.ts
    ├── teardown.ts                      # afterAll: closes NestJS app + connections per fork
    ├── context.ts                       # Shared test context (containers + NestJS app)
    ├── helpers/
    │   └── ch.ts                        # getCohortMembers helper
    └── cohort-membership.integration.test.ts
```

## Services

| Service | Responsibility | Key config |
|---|---|---|
| `CohortComputationService` | All data access: `findStaleCohorts` (PG read, excludes cohorts with `errors >= COHORT_MAX_ERRORS`), CH operations (`computeMembership` INSERT only, `deleteOldVersions` batched ALTER DELETE), PG tracking (`markComputationSuccess` → returns boolean, `recordError` → returns boolean), history (`recordSizeHistory` via single INSERT...SELECT using version filter, no FINAL), GC orphans (deletes ALL if no dynamic cohorts exist). Both PG tracking methods catch errors internally and return boolean — a transient PG failure never propagates | — |
| `CohortMembershipService` | Orchestrator (no direct DB access): scheduling, lock, backoff (`filterByBackoff`), groups cohorts by dependency level (`groupCohortsByLevel`), dispatches Bull jobs per level and waits for completion (`waitUntilFinished`), batch version cleanup, GC scheduling. `runCycle()` is `@internal` public for tests | 10min interval, 30s initial delay, distributed lock (660s TTL, extended per level), error backoff (2^n * 30min, max ~21 days), max errors cap (20, excluded at SQL level), GC every 6 cycles (~1hr, skips first cycle) |
| `CohortComputeProcessor` | Bull worker: processes individual `compute` jobs — `computeMembership` → `markComputationSuccess` → `recordSizeHistory`. Logs per-cohort duration. Returns `ComputeJobResult` for orchestrator to collect | concurrency=4 (COHORT_COMPUTE_CONCURRENCY), no Bull retry (error backoff handled by orchestrator) |
| `ShutdownService` | Graceful shutdown orchestrator | Stops service (awaits in-flight cycle), then closes QueueEvents + CH + PG pool + Redis with error logging |

## Key Patterns

### Cohort Membership Cycle

1. Acquire distributed lock (`cohort_membership:lock`, TTL 660s) — only one instance runs at a time
2. Fetch stale dynamic cohorts from PostgreSQL (`membership_computed_at < NOW() - COHORT_STALE_THRESHOLD_MINUTES minutes`)
3. Filter by error backoff (cohorts with errors skip cycles exponentially)
4. Topological sort (cohorts referencing other cohorts must be computed in dependency order); cyclic cohorts get error recorded and are skipped
5. Group sorted cohorts by dependency level (`groupCohortsByLevel`)
6. For each level: extend lock TTL, enqueue Bull `compute` jobs, wait for all to complete via `QueueEvents.waitUntilFinished`. Independent cohorts within a level are computed in parallel (concurrency=4)
7. Per compute job: `buildCohortSubquery()` → INSERT INTO `cohort_members` → `markComputationSuccess` (PG update, returns boolean) → record size history using exact version (no FINAL)
8. Batch-delete old versions — all successful `(cohort_id, version)` pairs from the cycle are combined into a single `ALTER TABLE DELETE` mutation
9. Garbage-collect orphaned memberships (every 6 cycles ≈ 1 hour, skips first cycle after startup; deletes ALL cohort_members if no dynamic cohorts exist in PG)

### Bull Queue

Per-cohort computation uses BullMQ (`cohort-compute` queue) for parallel execution. The orchestrator dispatches jobs per dependency level and synchronizes via `QueueEvents.waitUntilFinished()`. This replaces sequential processing — independent cohorts are computed in parallel with configurable concurrency.

### Distributed Lock

Injected via `DISTRIBUTED_LOCK` DI token. Uses `@qurvo/distributed-lock` (Redis SET NX + Lua-guarded release + extend). The `extend()` method is called before each dependency level to prevent lock expiry during long cycles.

### Error Backoff

Cohorts that fail to compute are skipped with exponential backoff: `2^errors * 30 minutes`, capped at ~21 days (exponent max 10). Cohorts with `errors_calculating >= 20` are permanently excluded from recalculation at the SQL level (`COHORT_MAX_ERRORS`).

### Startup Env Validation

`main.ts` requires `DATABASE_URL`, `REDIS_URL`, and `CLICKHOUSE_URL` — fails fast before NestJS bootstrap if missing.

## Integration Tests

Tests in `src/test/`. 42 integration tests covering:
- Property/event condition cohorts (eq, gte)
- AND (INTERSECT) / OR (UNION DISTINCT) logic
- Version cleanup (old rows removed)
- Orphan GC (deleted cohort memberships removed, 0 dynamic cohorts safe)
- Max errors cap (cohorts with >= 20 errors excluded)
- Batch delete (multiple cohorts cleaned up in single mutation)
- Distributed lock blocks concurrent runs
- Stale write rejection (newer membership_version wins)
- First write from null version
- 100 concurrent job enqueues (Bug 1)
- GC counter persisted in Redis across restarts (Bug 2)
- Rejected Bull job triggers recordError (Bug a)
- lock.extend() returning false or throwing aborts remaining levels (Bug b)
- waitUntilFinished timeout handling
- PG failure after CH write — membership_version not updated, next cycle recomputes
- GC scheduling via runCycle() at Nth cycle cadence
- GC counter increments on empty cycles (no stale cohorts)
- Advanced condition types: first_time_event, event_sequence, not_performed_event_sequence, performed_regularly, stopped_performing, restarted_performing
- Negated cohort-ref (dependency level ordering)
- Error backoff: recent error skipped, old error included, zero-error always eligible, exponent capped
- Cyclic dependency: both cohorts get recordError, neither in cohort_members, backoff on next cycle
- ClickHouse failure: error fields updated, not in pendingDeletions, retried after backoff expiry

### Unit Tests

`filterByBackoff` extracted as a pure function in `src/cohort-worker/backoff.ts`. 10 unit tests in `src/cohort-worker/__tests__/backoff.unit.test.ts`:
```bash
pnpm --filter @qurvo/cohort-worker exec vitest run --config vitest.unit.config.ts
```
