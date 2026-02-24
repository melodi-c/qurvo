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
├── constants.ts                         # Cohort interval, backoff config
├── tracer.ts                            # Datadog APM init (imported first in main.ts)
├── cohort-worker/
│   ├── cohort-worker.module.ts          # Providers from @qurvo/nestjs-infra + services
│   ├── cohort-membership.service.ts     # Periodic cohort membership recomputation + orphan GC
│   └── shutdown.service.ts              # Graceful shutdown (awaits in-flight cycle)
└── test/
    ├── setup.ts
    ├── context.ts                       # Shared test context (containers + NestJS app)
    ├── helpers/
    │   └── ch.ts                        # getCohortMembers helper
    └── processor/
        ├── cohort-membership.integration.test.ts
        └── cohort-toposort.test.ts
```

## Service

| Service | Responsibility | Key config |
|---|---|---|
| `CohortMembershipService` | Periodic cohort membership recomputation | 10min interval, 30s initial delay, distributed lock (300s TTL), error backoff (2^n * 30min, max ~21 days), orphan GC |
| `ShutdownService` | Graceful shutdown | Awaits in-flight cycle, then closes CH + Redis connections |

## Key Patterns

### Cohort Membership Cycle

1. Acquire distributed lock (`cohort_membership:lock`, TTL 300s) — only one instance runs at a time
2. Fetch stale dynamic cohorts from PostgreSQL (`membership_computed_at < NOW() - 15 minutes`)
3. Filter by error backoff (cohorts with errors skip cycles exponentially)
4. Topological sort (cohorts referencing other cohorts must be computed in dependency order)
5. For each cohort: `buildCohortSubquery()` → INSERT INTO `cohort_members` → DELETE old versions
6. Record size history in `cohort_membership_history`
7. Garbage-collect orphaned memberships (deleted cohorts)

### Distributed Lock

Uses `@qurvo/distributed-lock` (Redis SET NX + Lua-guarded release) to prevent multiple instances from running the same computation.

### Error Backoff

Cohorts that fail to compute are skipped with exponential backoff: `2^errors * 30 minutes`, capped at ~21 days (exponent max 10).

## Integration Tests

Tests in `src/test/processor/`. 7 integration tests + 6 unit tests:
- Property/event condition cohorts (eq, gte)
- AND (INTERSECT) / OR (UNION) logic
- Version cleanup (old rows removed)
- Orphan GC (deleted cohort memberships removed)
- Distributed lock blocks concurrent runs
- Topological sort (unit tests)
