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
│   ├── event-consumer.service.ts        # XREADGROUP loop + XAUTOCLAIM + heartbeat + event enrichment (GeoIP, person resolution → Event DTO)
│   ├── flush.service.ts                 # Buffer → ClickHouse batch insert + concurrency guard + shutdown()
│   ├── definition-sync.service.ts       # Upsert event/property definitions to PG + cache invalidation
│   ├── value-type.ts                    # detectValueType() + helpers (extracted from definition-sync)
│   ├── hourly-cache.ts                  # Time-bucketed deduplication cache (used by definition-sync + person-batch-store)
│   ├── person-resolver.service.ts       # Person ID resolution + $identify
│   ├── person-utils.ts                  # parseUserProperties() — $set/$set_once/$unset parsing
│   ├── person-batch-store.ts            # Batched person writes + identity merge transaction
│   ├── dlq.service.ts                   # Dead letter queue replay
│   ├── event-utils.ts                   # safeScreenDimension() — shared screen dimension sanitizer
│   ├── redis-utils.ts                   # parseRedisFields() — shared Redis field parser
│   ├── retry.ts                         # withRetry() linear backoff + jitter
│   ├── shutdown.service.ts              # Graceful shutdown orchestrator with error isolation
│   └── geo.service.ts                   # GeoIP lookup (hardcoded DEFAULT_MMDB_URL to selstorage.ru — intentional, not a concern)
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
  → EventConsumerService: GeoIP lookup + person resolution → Event DTO
  → Buffer (max 1000 events)
  → FlushService: batch insert to ClickHouse (every 5s or on threshold, concurrency-guarded)
  → XACK (confirm consumption)
  → DefinitionSyncService: upsert event/property definitions + cache invalidation
```

## Services

| Service | Responsibility | Key config |
|---|---|---|
| `EventConsumerService` | XREADGROUP loop, XAUTOCLAIM for pending, heartbeat, event enrichment (GeoIP + person resolution → Event DTO) | Claim idle >60s every 30s, backpressure via `PROCESSOR_BACKPRESSURE_THRESHOLD` |
| `FlushService` | Buffer events, batch insert to ClickHouse | 1000 events or 5s interval, 3 retries then DLQ, concurrency guard (coalesces parallel flush calls), `shutdown()` = wait for in-progress flush + final flush |
| `DefinitionSyncService` | Upsert event/property definitions to PG | `HourlyCache` dedup, cache invalidation via Redis DEL |
| `PersonResolverService` | Atomic get-or-create person_id via Redis+PG | Redis SET NX with 90d TTL, PG cold-start fallback |
| `PersonBatchStore` | Batched person writes + identity merge | Bulk upsert persons/distinct_ids, transactional merge, `HourlyCache` for knownDistinctIds dedup |
| `DlqService` | Replay dead-letter events | 100 events every 5min, circuit breaker (5 failures, 5min reset) |
| `ShutdownService` | Graceful shutdown orchestration | Error-isolated: each step wrapped in catch so failures don't abort subsequent steps |

## Key Patterns

### Heartbeat
Uses `@qurvo/heartbeat` package — framework-agnostic file-based liveness heartbeat. Created in `EventConsumerService` constructor, started/stopped with the consumer loop. If the loop doesn't call `touch()` within 30s, heartbeat writes are skipped (stale detection).

### Distributed Lock
`DlqService` uses `@qurvo/distributed-lock` (Redis SET NX + Lua-guarded release) to prevent multiple instances from running the same work.

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
`ShutdownService` implements `OnApplicationShutdown` with error isolation:
1. Stop consumer loop (+ heartbeat) — errors caught, logged, don't block next steps
2. Stop DLQ timer
3. `FlushService.shutdown()` — stop timer + await in-progress flush + final flush (includes `personBatchStore.flush()` internally) — errors caught separately
4. Close Redis/ClickHouse connections — errors swallowed

### Architectural Decisions (do NOT revisit)
- **`buildEvent()` stays in EventConsumerService** — was extracted into `EventEnrichmentService` (d4ebb54) then inlined back (41c923e) because it was a thin coordinator with no independent logic. Keep it inline.
- **`DefinitionSyncService` stays as one service** — 3 table upserts + 3 caches + invalidation form one cohesive workflow. Splitting by table would only add complexity.
- **`PersonBatchStore` combines persons + distinct_ids + merges** — all part of "manage person data in PG". Single responsibility.
- **DLQ stays in processor, not a separate worker** — 100 events every 5 min, not worth a separate app.

### Shared Utilities
`redis-utils.ts` contains `parseRedisFields()` — converts flat Redis `[key, value, key, value, ...]` arrays into `Record<string, string>`. Used by both `EventConsumerService` and `DlqService`. Do NOT inline this back into individual services or duplicate it — keep it in `redis-utils.ts`.

### GeoIP
`GeoService` downloads MaxMind MMDB from `DEFAULT_MMDB_URL` (hardcoded selstorage.ru) or `GEOLITE2_COUNTRY_URL` env var. This is intentional — the URL is a controlled bucket. If download fails, geo lookup silently degrades to empty string.

## Integration Tests

Tests in `src/test/processor/`. 78 tests across 8 files:
- Pipeline: event processing, batch processing, person_id assignment, $identify merging
- Person resolution: resolve, merge, properties, $set/$set_once/$unset
- Flush & metadata: batch flush, PEL cleanup, cache invalidation (event_names, event_property_names)
- Definition sync: event/property upserts, dedup, value type detection, skip rules
- Distributed lock: acquire/release semantics, contention, TTL expiry, Lua-guarded release
- DLQ: replay, circuit breaker
