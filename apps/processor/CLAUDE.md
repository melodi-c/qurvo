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
│   ├── event-consumer.service.ts        # XREADGROUP loop + XAUTOCLAIM + heartbeat + pipeline orchestration
│   ├── pipeline/                        # Typed pipeline steps (extracted from EventConsumerService)
│   │   ├── types.ts                     # RawMessage, ValidMessage, BufferedEvent, ResolveResult, PersonKey
│   │   ├── parse.step.ts               # Step 1: flat Redis arrays → RawMessage[]
│   │   ├── validate.step.ts            # Step 2: validate required fields + illegal distinct_ids
│   │   ├── prefetch.step.ts            # Step 3: batch MGET person IDs from Redis
│   │   ├── resolve.step.ts             # Step 4: person resolution + UA parsing + Event DTO building (concurrent across groups)
│   │   └── index.ts                    # Re-exports all steps + BufferedEvent type
│   ├── flush.service.ts                 # Buffer → ClickHouse batch insert + promise-based concurrency guard + shutdown()
│   ├── definition-sync.service.ts       # Upsert event/property definitions to PG + cache invalidation
│   ├── value-type.ts                    # detectValueType() + helpers (extracted from definition-sync)
│   ├── hourly-cache.ts                  # Time-bucketed deduplication cache (used by definition-sync + person-batch-store)
│   ├── person-resolver.service.ts       # Deterministic person ID resolution (UUIDv5) + batch prefetch + $identify
│   ├── deterministic-person-id.ts       # UUIDv5 person ID generation (fixed namespace — NEVER change)
│   ├── person-utils.ts                  # parseUserProperties() — $set/$set_once/$unset parsing + noisy property filtering
│   ├── person-batch-store.ts            # Batched person writes + identity merge transaction + failed merge persistence
│   ├── dlq.service.ts                   # Dead letter queue replay
│   ├── event-utils.ts                   # safeScreenDimension() + groupByKey() + parseUa() — shared utilities
│   ├── time-utils.ts                    # floorToHourMs() — shared time utilities
│   ├── redis-utils.ts                   # parseRedisFields() — shared Redis field parser
│   ├── retry.ts                         # withRetry() linear backoff + jitter
│   ├── shutdown.service.ts              # Graceful shutdown orchestrator with error isolation
│   └── geo.service.ts                   # GeoIP lookup with MMDB staleness check (hardcoded DEFAULT_MMDB_URL to selstorage.ru — intentional)
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
  → pipeline/parse.step     — flat Redis arrays → RawMessage[]
  → pipeline/validate.step  — drop invalid events (missing fields / illegal distinct_ids), XACK them
  → pipeline/prefetch.step  — batch MGET person IDs from Redis (single RTT)
  → pipeline/resolve.step   — GroupBy project_id:distinct_id, concurrent groups via allSettled
                              → GeoIP lookup + UA parsing + person resolution → Event DTO
  → Buffer (max 1000 events)
  → FlushService: batch insert to ClickHouse (every 5s or on threshold, concurrency-guarded)
  → XACK (confirm consumption)
  → DefinitionSyncService: upsert event/property definitions + cache invalidation
```

## Services

| Service | Responsibility | Key config |
|---|---|---|
| `EventConsumerService` | XREADGROUP loop, XAUTOCLAIM for pending, heartbeat, pipeline orchestration | Claim idle >60s every 30s, backpressure via `PROCESSOR_BACKPRESSURE_THRESHOLD`, exits after 100 consecutive errors for K8s restart, `consecutiveErrors` only resets after successful `processMessages()` (not on empty XREADGROUP) |
| `FlushService` | Buffer events, batch insert to ClickHouse | 1000 events or 5s interval, PG person flush is critical (failure → DLQ), 3 CH retries then DLQ, promise-based concurrency guard, `shutdown()` = wait for in-progress flush + final flush. Root cause of batch failure is logged before DLQ routing. |
| `DefinitionSyncService` | Upsert event/property definitions to PG | `HourlyCache` dedup, cache invalidation via Redis DEL |
| `PersonResolverService` | Deterministic person_id resolution via UUIDv5 + Redis cache + PG fallback | Batch MGET prefetch, deterministic UUIDs (same project+distinct_id → same person_id), Redis SET NX with 90d TTL, PG cold-start fallback for legacy data |
| `PersonBatchStore` | Batched person writes + identity merge | Promise-based flush lock (concurrent callers await previous flush then run), bulk upsert persons/distinct_ids with conditional WHERE (skip unchanged), updated_at floored to hour, re-queues pending data on flush failure, transactional merge with retry (3×200ms), failed merges persisted to Redis for retry (`processor:failed_merges`), `HourlyCache` for knownDistinctIds dedup |
| `DlqService` | Replay dead-letter events with full pipeline | 100 events every 5min, re-enqueues person data + flushes via PersonBatchStore (promise lock handles concurrency with FlushService) + runs definition sync during replay, cross-instance circuit breaker via Redis (5 failures, 5min reset). DLQ events are already-processed Event DTOs — no re-parsing of screen dimensions needed |
| `ShutdownService` | Graceful shutdown orchestration | Error-isolated: each step wrapped in catch so failures don't abort subsequent steps |

## Key Patterns

### Pipeline Steps
Pipeline logic is extracted into `pipeline/` directory with typed functions:
- `parseMessages()` — flat Redis arrays → `RawMessage[]`
- `validateMessages()` — validate required fields + illegal distinct_ids → `{ valid, invalidIds }`
- `prefetchPersons()` — collect unique keys, single MGET → `Map<string, string>`
- `resolveAndBuildEvents()` — group by distinct_id, concurrent resolution via `Promise.allSettled` → `{ buffered, failedIds }`

All types are in `pipeline/types.ts`: `RawMessage`, `ValidMessage`, `BufferedEvent`, `ResolveResult`, `PersonKey`. Only `BufferedEvent` is re-exported from `pipeline/index.ts` (used by `FlushService`); other types are internal to the pipeline. `EventConsumerService.processMessages()` orchestrates these steps. Each step is a pure function (except resolve, which depends on services passed as deps).

### Heartbeat
Uses `@qurvo/heartbeat` package — framework-agnostic file-based liveness heartbeat. Created in `EventConsumerService` constructor, started/stopped with the consumer loop. If the loop doesn't call `touch()` within 30s, heartbeat writes are skipped (stale detection).

### Distributed Lock
`DlqService` uses `@qurvo/distributed-lock` (Redis SET NX + Lua-guarded release) to prevent multiple instances from running the same work.

### Person Resolution
```
1. Batch MGET prefetch all person:{projectId}:{distinctId} keys for the batch (single RTT)
2. For each event: check prefetched cache → hit = return cached person_id
3. Cache miss → compute deterministic UUIDv5(projectId:distinctId) → Redis SET NX
4. SET NX succeeded (new key) → PG lookup for legacy data (backward compat) → return PG or deterministic ID
5. SET NX failed (key existed) → Redis GET → return existing value
6. $identify → merge anonymous + known person, write override to ClickHouse, update cache
```
Person IDs are deterministic: same project+distinct_id always produces the same UUID (via UUIDv5 with a fixed namespace).
PG fallback is kept for backward compatibility with pre-deterministic person IDs in production.

### Identity Merging ($identify)
When `$identify` event arrives with `anonymous_id`:
1. Resolve both anonymous and user person_ids
2. Write override to `person_distinct_id_overrides` table (ClickHouse)
3. Merge PostgreSQL person records (transactional, inside `PersonBatchStore`)
4. Update Redis cache

### Failed Merge Persistence
When `mergePersons()` fails after all retries, the merge is persisted to Redis list `processor:failed_merges` (max 1000 entries). On every flush cycle, `PersonBatchStore` replays up to 10 failed merges — successful ones are removed, failures stay for the next cycle. This prevents silent PG/CH inconsistency after transient PG failures.

### Dead Letter Queue
Failed batches (PG person flush failure OR 3 CH retries exhausted) → `events:dlq` stream (MAXLEN 100k). `DlqService` replays with full pipeline: re-enqueues person data into `PersonBatchStore`, flushes to PG (promise-based lock in PersonBatchStore handles concurrency with FlushService — no polling), inserts to CH, then runs `DefinitionSyncService`. Cross-instance circuit breaker (via Redis keys `dlq:replay:failures` + `dlq:replay:circuit`) and distributed lock. XACK only after successful DLQ write — if DLQ fails, events stay in PEL and XAUTOCLAIM re-delivers them (at-least-once guarantee). Root cause of batch failure is logged before DLQ routing for diagnostics.

### Retry Presets
Named retry configs in `constants.ts`: `RETRY_CLICKHOUSE` (3×1000ms), `RETRY_POSTGRES` (3×200ms), `RETRY_DEFINITIONS` (3×50ms). Used by all `withRetry()` call sites — centralizes tuning.

### Graceful Shutdown
`ShutdownService` implements `OnApplicationShutdown` with error isolation:
1. Stop consumer loop (+ heartbeat) — errors caught, logged, don't block next steps
2. Stop DLQ timer
3. `FlushService.shutdown()` — stop timer + await in-progress flush + final flush (includes `personBatchStore.flush()` internally) — errors caught separately
4. Close Redis/ClickHouse connections — errors swallowed

### Architectural Decisions (do NOT revisit)
- **`DefinitionSyncService` stays as one service** — 3 table upserts + 3 caches + invalidation form one cohesive workflow. Splitting by table would only add complexity.
- **`PersonBatchStore` combines persons + distinct_ids + merges** — all part of "manage person data in PG". Single responsibility.
- **DLQ stays in processor, not a separate worker** — 100 events every 5 min, not worth a separate app.
- **Redis Streams, not Kafka** — Kafka justified at >100k events/sec or multi-datacenter. Redis Streams gives consumer groups + XAUTOCLAIM + backpressure at our scale without extra infra.
- **Direct CH INSERT, not Kafka table engine** — PostHog uses Kafka engine (CH pulls from Kafka). We use `async_insert: 1` + batch flush (1000/5s). Sufficient at current scale; Kafka engine requires Kafka.
- **Single-threaded, no Piscina** — Person resolution + definition sync are I/O bound. Worker threads add complexity without throughput gain for async I/O workloads.
- **PersonResolver uses deterministic UUIDs (UUIDv5)** — person_id = UUIDv5(projectId:distinctId) with a fixed namespace. Two processor instances always compute the same UUID for the same input, eliminating races entirely. Redis SET NX + PG fallback kept for backward compat with legacy random UUIDs. Batch MGET prefetch reduces per-event Redis RTTs to a single batch call. The namespace in `deterministic-person-id.ts` must NEVER change.
- **Pipeline steps are function-level in `pipeline/` directory** — `processMessages()` orchestrates 4 typed step functions: `parseMessages()`, `validateMessages()`, `prefetchPersons()`, `resolveAndBuildEvents()`. Each step has typed input/output. Full class-level pipeline framework (PostHog V2 style) is overkill at current scale — functions are simpler and more testable. `buildEvent()` lives inside `resolve.step.ts` as a private helper.
- **Overflow routing for noisy tenants** — Not needed at current scale. If one project dominates traffic, consider a second Redis Stream `events:overflow` + separate consumer routed by project_id.

### UA Parsing
`parseUa()` in `event-utils.ts` uses `ua-parser-js` to extract browser, OS, and device type from the raw `user_agent` field. SDK context fields (`data.browser`, `data.os`, etc.) take precedence over parsed values — UA parsing is the fallback for when the SDK doesn't provide structured device info.

### Noisy Person Property Filtering
`parseUserProperties()` in `person-utils.ts` filters out high-churn properties (browser, OS, screen size, URL, GeoIP) from `$set`/`$set_once` before they reach PG. These properties change on every pageview and are already stored as dedicated columns in CH events. Filtering them reduces PG write amplification significantly for active users. The filtered set is defined in `NOISY_PERSON_PROPERTIES`. Custom user properties (e.g. `plan`, `company`) are NOT filtered.

### Conditional Person Updates
`PersonBatchStore.flushPersons()` uses `WHERE persons.properties IS DISTINCT FROM excluded.properties OR persons.updated_at < excluded.updated_at` to skip PG writes when nothing changed. Combined with `updated_at` floored to the hour (PostHog pattern), this eliminates redundant writes for active users within the same hour.

### Shared Utilities
`redis-utils.ts` contains `parseRedisFields()` — converts flat Redis `[key, value, key, value, ...]` arrays into `Record<string, string>`. Used by both `EventConsumerService` and `DlqService`. Do NOT inline this back into individual services or duplicate it — keep it in `redis-utils.ts`.

### GeoIP
`GeoService` downloads MaxMind MMDB from `DEFAULT_MMDB_URL` (hardcoded selstorage.ru) or `GEOLITE2_COUNTRY_URL` env var. This is intentional — the URL is a controlled bucket. Downloads retry 3 times with linear backoff (2s × attempt). Cached MMDB at `/tmp` has a 30-day staleness check — files older than 30 days trigger a re-download. If download fails but a stale file exists, it's used as fallback. If all attempts fail and no cached file exists, geo lookup silently degrades to empty string.

## Integration Tests

Tests in `src/test/processor/`. 78 tests across 8 files:
- Pipeline: event processing, batch processing, person_id assignment, $identify merging
- Person resolution: resolve, merge, properties, $set/$set_once/$unset
- Flush & metadata: batch flush, PEL cleanup, cache invalidation (event_names, event_property_names)
- Definition sync: event/property upserts, dedup, value type detection, skip rules
- Distributed lock: acquire/release semantics, contention, TTL expiry, Lua-guarded release
- DLQ: replay, circuit breaker
