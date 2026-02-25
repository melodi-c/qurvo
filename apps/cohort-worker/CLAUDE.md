# Cohort Worker App

NestJS background worker. No HTTP server. Periodically recomputes dynamic cohort memberships.

## Commands

```bash
pnpm --filter @qurvo/cohort-worker dev          # watch mode
pnpm --filter @qurvo/cohort-worker build        # nest build → dist/
pnpm --filter @qurvo/cohort-worker start        # node dist/main.js

# Integration tests (requires infra:up)
pnpm --filter @qurvo/cohort-worker test:integration
```

## Architecture

```
src/
├── app.module.ts                        # Root: LoggerModule + CohortWorkerModule
├── main.ts                              # Entry point: env validation + NestFactory (no HTTP)
├── constants.ts                         # Cohort interval, backoff, lock config
├── tracer.ts                            # Datadog APM init (imported first in main.ts)
├── cohort-worker/
│   ├── tokens.ts                        # DI token: DISTRIBUTED_LOCK
│   ├── cohort-worker.module.ts          # Providers from @qurvo/nestjs-infra + DistributedLockProvider + services
│   ├── cohort-computation.service.ts    # CH/PG operations for individual cohorts
│   ├── cohort-membership.service.ts     # Cycle orchestration: scheduling, lock, backoff
│   └── shutdown.service.ts              # Graceful shutdown: stops service, closes CH + PG + Redis
└── test/
    ├── setup.ts
    ├── teardown.ts                      # afterAll: closes NestJS app + connections per fork
    ├── context.ts                       # Shared test context (containers + NestJS app)
    ├── helpers/
    │   └── ch.ts                        # getCohortMembers helper
    └── cohort-membership.integration.test.ts
```

## Service

| Service | Responsibility | Key config |
|---|---|---|
| `CohortComputationService` | CH operations (`computeMembership`), PG tracking (`markComputationSuccess` → returns boolean, `recordError`), history, GC orphans. PG update is separate so a transient PG failure after successful CH write doesn't trigger error backoff | — |
| `CohortMembershipService` | Cycle orchestration: scheduling, lock, backoff (`filterByBackoff`), GC scheduling (`runGcIfDue`), delegates to computation. `runCycle()` is `@internal` public for tests. Tracks `pgFailed` for observability | 10min interval, 30s initial delay, distributed lock (660s TTL), error backoff (2^n * 30min, max ~21 days), GC every 6 cycles (~1hr, skips first cycle) |
| `ShutdownService` | Graceful shutdown orchestrator | Stops service (awaits in-flight cycle), then closes CH + PG pool + Redis with error logging |

## Key Patterns

### Cohort Membership Cycle

1. Acquire distributed lock (`cohort_membership:lock`, TTL 660s) — only one instance runs at a time
2. Fetch stale dynamic cohorts from PostgreSQL (`membership_computed_at < NOW() - COHORT_STALE_THRESHOLD_MINUTES minutes`)
3. Filter by error backoff (cohorts with errors skip cycles exponentially)
4. Topological sort (cohorts referencing other cohorts must be computed in dependency order); cyclic cohorts get error recorded and are skipped
5. For each cohort (per-cohort version = `Date.now()`): `buildCohortSubquery()` → INSERT INTO `cohort_members` → DELETE old versions → `markComputationSuccess` (PG update, returns boolean — failure logged as warn, no error backoff)
6. Record size history in `cohort_membership_history` (skipped if PG tracking failed)
7. Garbage-collect orphaned memberships (every 6 cycles ≈ 1 hour, skips first cycle after startup, skips if no dynamic cohorts found in PG)

### Distributed Lock

Injected via `DISTRIBUTED_LOCK` DI token (defined in `tokens.ts`, provider factory in `cohort-worker.module.ts`). Uses `@qurvo/distributed-lock` (Redis SET NX + Lua-guarded release) to prevent multiple instances from running the same computation.

### Error Backoff

Cohorts that fail to compute are skipped with exponential backoff: `2^errors * 30 minutes`, capped at ~21 days (exponent max 10).

### Startup Env Validation

`main.ts` requires `DATABASE_URL`, `REDIS_URL`, and `CLICKHOUSE_URL` — fails fast before NestJS bootstrap if missing.

## Integration Tests

Tests in `src/test/`. 7 integration tests:
- Property/event condition cohorts (eq, gte)
- AND (INTERSECT) / OR (UNION) logic
- Version cleanup (old rows removed)
- Orphan GC (deleted cohort memberships removed)
- Distributed lock blocks concurrent runs
