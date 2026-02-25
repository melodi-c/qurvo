# Billing Worker App

NestJS background worker. No HTTP server. Periodically checks billing counters and populates `billing:quota_limited` Redis Set for ingest's `BillingGuard`.

## Commands

```bash
pnpm --filter @qurvo/billing-worker dev          # watch mode
pnpm --filter @qurvo/billing-worker build        # nest build → dist/
pnpm --filter @qurvo/billing-worker start        # node dist/main.js
```

## Architecture

```
src/
├── app.module.ts                        # Root: workerLoggerModule() + BillingModule
├── main.ts                              # bootstrapWorker() from @qurvo/worker-core (env validation, no HTTP)
├── constants.ts                         # Billing interval, TTL, Redis key contracts
├── tracer.ts                            # Datadog APM init (imported first in main.ts)
├── billing/
│   ├── billing.module.ts                # Redis + Drizzle providers + services
│   ├── billing-check.service.ts         # Periodic billing check cycle (extends PeriodicWorkerMixin)
│   └── shutdown.service.ts              # Graceful shutdown: stops service, closes PG + Redis
```

## How It Works (PostHog Pattern — Decoupled Billing)

Every 30 seconds:
1. Query PG for all projects with a non-null `events_limit` (via `plans` table)
2. Batch-read billing counters from Redis (`MGET billing:events:{projectId}:{YYYY-MM}`)
3. Compare each counter with its limit
4. Atomically replace `billing:quota_limited` Redis Set with over-limit project IDs (`MULTI` → `DEL` + `SADD` + `EXPIRE`)

The ingest app's `BillingGuard` does a single `SISMEMBER billing:quota_limited {projectId}` — O(1), no counter arithmetic, no DB query.

### Safety TTL
The set has a 120s TTL. If the billing worker stops, the set auto-expires within 2 minutes, and ingest stops enforcing stale billing limits (fails open).

### Redis Key Contracts
Constants are intentionally duplicated from `apps/ingest/src/constants.ts` — both apps share the same Redis key names but have no shared runtime dependency.

- `billing:events:{projectId}:{YYYY-MM}` — monthly event counter (incremented by ingest)
- `billing:quota_limited` — Redis Set of project IDs that are over their event limit (populated by this worker, read by ingest)

## Integration Tests

`src/test/billing-check.integration.test.ts` — 7 tests:
- Over-limit project added to set
- Under-limit project not added
- Removal when counter drops below limit
- Stale entries cleaned on cycle
- Multiple projects — only over-limit in set
- TTL set on key (≤120s)
- Missing counter treated as 0 events

```bash
pnpm --filter @qurvo/billing-worker test:integration
```

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — Datadog APM, loaded via `-r` flag at runtime.
