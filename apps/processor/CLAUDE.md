# Processor App

NestJS background worker. No HTTP server. Consumes events from Redis Stream, resolves person identity, writes to ClickHouse.

## Commands

```bash
pnpm --filter @qurvo/processor dev          # watch mode
pnpm --filter @qurvo/processor build        # nest build → dist/
pnpm --filter @qurvo/processor start        # node dist/main.js

# Integration tests (requires infra:up)
pnpm --filter @qurvo/processor test:integration
```

## Architecture

```
src/
├── app.module.ts                        # Root: LoggerModule + ProcessorModule
├── main.ts                              # NestFactory.createApplicationContext (no HTTP)
├── constants.ts                         # Stream, flush, DLQ, retry presets
├── tracer.ts                            # Datadog APM init (imported first in main.ts)
├── processor/
│   ├── processor.module.ts              # All providers + services, OnApplicationShutdown
│   ├── event-consumer.service.ts        # XREADGROUP loop + XAUTOCLAIM + heartbeat (via @qurvo/heartbeat)
│   ├── event-enrichment.service.ts      # GeoIP + person resolution → Event DTO (SRP)
│   ├── flush.service.ts                 # Buffer → ClickHouse batch insert + shutdown()
│   ├── definition-sync.service.ts       # Upsert event/property definitions to PG + cache invalidation
│   ├── hourly-cache.ts                  # Time-bucketed deduplication cache (used by definition-sync)
│   ├── person-resolver.service.ts       # Person ID resolution + $identify
│   ├── person-utils.ts                  # parseUserProperties() — $set/$set_once/$unset parsing
│   ├── person-batch-store.ts            # Batched person writes + identity merge transaction
│   ├── cohort-membership.service.ts     # Periodic cohort membership recomputation + orphan GC
│   ├── cohort-toposort.ts               # Topological sort for cohort dependencies
│   ├── dlq.service.ts                   # Dead letter queue replay
│   ├── retry.ts                         # withRetry() linear backoff + jitter
│   ├── insert.ts                        # ClickHouse insert helper
│   ├── utils.ts                         # Redis field parsing
│   └── geo.service.ts                   # GeoIP lookup
├── providers/
│   ├── redis.provider.ts
│   ├── clickhouse.provider.ts
│   └── drizzle.provider.ts
└── test/
    ├── setup.ts
    ├── context.ts                       # Shared test context (containers + NestJS app)
    ├── helpers/
    │   ├── poll.ts                      # pollUntil<T>() generic polling utility
    │   └── ...
    └── processor/
```

## Processing Pipeline

```
Redis Stream (events:incoming)
  → XREADGROUP (consumer group: processor-group)
  → EventEnrichmentService: GeoIP lookup + person resolution → Event DTO
  → Buffer (max 1000 events)
  → FlushService: batch insert to ClickHouse (every 5s or on threshold)
  → XACK (confirm consumption)
  → DefinitionSyncService: upsert event/property definitions + cache invalidation
```

## Services

| Service | Responsibility | Key config |
|---|---|---|
| `EventConsumerService` | XREADGROUP loop, XAUTOCLAIM for pending, heartbeat | Claim idle >60s every 30s, backpressure via `PROCESSOR_BACKPRESSURE_THRESHOLD` |
| `EventEnrichmentService` | GeoIP + person resolution → Event DTO | Extracted from consumer for SRP |
| `FlushService` | Buffer events, batch insert to ClickHouse | 1000 events or 5s interval, 3 retries then DLQ, `shutdown()` = stop + final flush |
| `DefinitionSyncService` | Upsert event/property definitions to PG | `HourlyCache` dedup, cache invalidation via Redis DEL |
| `PersonResolverService` | Atomic get-or-create person_id via Redis+PG | Redis SET NX with 90d TTL, PG cold-start fallback |
| `PersonBatchStore` | Batched person writes + identity merge | Bulk upsert persons/distinct_ids, transactional merge |
| `CohortMembershipService` | Periodic cohort membership recomputation | 10min interval, distributed lock, error backoff, orphan GC |
| `DlqService` | Replay dead-letter events | 100 events every 5min, circuit breaker (5 failures, 5min reset) |

## Key Patterns

### Heartbeat
Uses `@qurvo/heartbeat` package — framework-agnostic file-based liveness heartbeat. Created in `EventConsumerService` constructor, started/stopped with the consumer loop. If the loop doesn't call `touch()` within 30s, heartbeat writes are skipped (stale detection).

### Distributed Lock
Both `DlqService` and `CohortMembershipService` use `@qurvo/distributed-lock` (Redis SET NX + Lua-guarded release) to prevent multiple instances from running the same work.

### Person Resolution
```
1. Redis GET person:{projectId}:{distinctId}
2. Miss → PostgreSQL lookup
3. Miss → Create new person (UUID) + Redis SET NX
4. $identify → merge anonymous + known person, write override to ClickHouse
```

### Identity Merging ($identify)
When `$identify` event arrives with `anonymous_id`:
1. Resolve both anonymous and user person_ids
2. Write override to `person_distinct_id_overrides` table (ClickHouse)
3. Merge PostgreSQL person records (transactional, inside `PersonBatchStore`)
4. Update Redis cache

### Dead Letter Queue
Failed batches (3 retries exhausted) → `events:dlq` stream (MAXLEN 100k). `DlqService` replays with circuit breaker and distributed lock.

### Retry Presets
Named retry configs in `constants.ts`: `RETRY_CLICKHOUSE` (3×1000ms), `RETRY_POSTGRES` (3×200ms), `RETRY_DEFINITIONS` (3×50ms). Used by all `withRetry()` call sites — centralizes tuning.

### Graceful Shutdown
`ShutdownService` implements `OnApplicationShutdown`:
1. Stop consumer loop (+ heartbeat)
2. Stop DLQ + cohort timers
3. `FlushService.shutdown()` — stop timer + final flush of remaining buffer
4. Close Redis/ClickHouse connections

## Integration Tests

Tests in `src/test/processor/`. 85 tests across 9 files:
- Pipeline: event processing, batch processing, person_id assignment, $identify merging
- Person resolution: resolve, merge, properties, $set/$set_once/$unset
- Flush & metadata: batch flush, PEL cleanup, cache invalidation (event_names, event_property_names)
- Definition sync: event/property upserts, dedup, value type detection, skip rules
- Cohort membership: property/event conditions, AND/OR logic, version cleanup, orphan GC, distributed lock
- Distributed lock: acquire/release semantics, contention, TTL expiry, Lua-guarded release
- DLQ: replay, circuit breaker
