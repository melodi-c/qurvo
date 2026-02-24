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
├── main.ts                              # NestFactory.createApplicationContext (no HTTP)
├── constants.ts                         # Cohort interval, backoff, lock config
├── tracer.ts                            # Datadog APM init (imported first in main.ts)
├── cohort-worker/
│   ├── cohort-worker.module.ts          # Providers from @qurvo/nestjs-infra + services
│   ├── cohort-computation.service.ts    # CH/PG operations for individual cohorts
│   ├── cohort-membership.service.ts     # Cycle orchestration: scheduling, lock, backoff
│   └── shutdown.service.ts              # Graceful shutdown: stops service, closes CH + Redis
└── test/
    ├── setup.ts
    ├── teardown.ts                      # afterAll: closes NestJS app + connections per fork
    ├── context.ts                       # Shared test context (containers + NestJS app)
    ├── helpers/
    │   └── ch.ts                        # getCohortMembers helper
    └── processor/
        └── cohort-membership.integration.test.ts
```

## Service

| Service | Responsibility | Key config |
|---|---|---|
| `CohortComputationService` | CH/PG operations: compute membership, record errors/history, GC orphans | — |
| `CohortMembershipService` | Cycle orchestration: scheduling, lock, backoff, delegates to computation | 10min interval, 30s initial delay, distributed lock (300s TTL), error backoff (2^n * 30min, max ~21 days), GC every 6 cycles (~1hr) |
| `ShutdownService` | Graceful shutdown orchestrator | Stops service (awaits in-flight cycle), then closes CH + Redis with error logging |

## Key Patterns

### Cohort Membership Cycle

1. Acquire distributed lock (`cohort_membership:lock`, TTL 300s) — only one instance runs at a time
2. Fetch stale dynamic cohorts from PostgreSQL (`membership_computed_at < NOW() - 15 minutes`)
3. Filter by error backoff (cohorts with errors skip cycles exponentially)
4. Topological sort (cohorts referencing other cohorts must be computed in dependency order)
5. For each cohort: `buildCohortSubquery()` → INSERT INTO `cohort_members` → DELETE old versions
6. Record size history in `cohort_membership_history`
7. Garbage-collect orphaned memberships (every 6 cycles ≈ 1 hour)

### Distributed Lock

Uses `@qurvo/distributed-lock` (Redis SET NX + Lua-guarded release) to prevent multiple instances from running the same computation.

### Error Backoff

Cohorts that fail to compute are skipped with exponential backoff: `2^errors * 30 minutes`, capped at ~21 days (exponent max 10).

## Integration Tests

Tests in `src/test/processor/`. 7 integration tests:
- Property/event condition cohorts (eq, gte)
- AND (INTERSECT) / OR (UNION) logic
- Version cleanup (old rows removed)
- Orphan GC (deleted cohort memberships removed)
- Distributed lock blocks concurrent runs
