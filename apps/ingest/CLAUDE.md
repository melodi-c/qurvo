# Ingest App

NestJS event collection service. Port 3001. Receives SDK events, validates per-event, enriches, writes to Redis Stream.

## Commands

```bash
pnpm --filter @qurvo/ingest dev          # watch mode
pnpm --filter @qurvo/ingest build        # nest build → dist/
pnpm --filter @qurvo/ingest start        # node dist/main.js

# Integration tests (requires infra:up)
pnpm --filter @qurvo/ingest test:integration
```

## Architecture

```
src/
├── app.module.ts        # Root: REDIS + DRIZZLE providers, LoggerModule, filters, graceful shutdown
├── main.ts              # Bootstrap (Fastify, CORS: mirror-origin, gzip preParsing hook, env validation, port 3001)
├── env.ts               # Zod env validation (DATABASE_URL, REDIS_URL, INGEST_PORT, LOG_LEVEL, NODE_ENV)
├── constants.ts         # REDIS_STREAM_EVENTS, REDIS_STREAM_MAXLEN, STREAM_SCHEMA_VERSION, billing keys, rate limit constants, MAX_DECOMPRESSED_BYTES, BODY_READ_TIMEOUT_MS, MAX_TIMESTAMP_DRIFT_MS, STREAM_BACKPRESSURE_THRESHOLD, BACKPRESSURE_CACHE_TTL_MS, HANDLER_TIMEOUT_MS, API_KEY_MAX_LENGTH
├── ingest/
│   ├── ingest.controller.ts  # GET /health, POST /v1/batch, POST /v1/import
│   ├── ingest.service.ts     # Event building + Redis stream writing
│   └── ingest.service.test.ts # Unit tests (resolveTimestamp)
├── guards/
│   ├── api-key.guard.ts      # Validates API key (header or body) against DB, caches in Redis
│   ├── rate-limit.guard.ts   # Per-project sliding window rate limit (100K events/60s, Redis buckets)
│   └── billing.guard.ts      # Checks monthly event limit, sets request.quotaLimited flag
├── decorators/
│   └── project-id.decorator.ts  # @ProjectId() param decorator — reads request.projectId
├── filters/
│   └── zod-exception.filter.ts  # Maps ZodError → 400
├── schemas/
│   ├── event.ts              # TrackEventSchema, BatchWrapperSchema (Zod)
│   └── import-event.ts       # ImportEventSchema (extends TrackEventSchema), ImportBatchSchema
├── hooks/
│   └── gzip-preparsing.ts    # Fastify preParsing: gzip decompression, bomb protection, magic byte auto-detect, body read timeout
├── types/
│   └── fastify.d.ts          # Fastify request augmentation (projectId, eventsLimit, quotaLimited)
└── test/                # Integration tests
    ├── setup.ts
    ├── helpers/
    └── ingest/
```

## Endpoints

| Method | Path | Auth | Response | Description |
|---|---|---|---|---|
| GET | `/health` | No | 200 `{ status: 'ok' }` | Liveness check (k8s liveness + startup probes) |
| GET | `/ready` | No | 200 `{ status: 'ok' }` or 503 | Readiness check — Redis PING (k8s readiness probe) |
| POST | `/v1/batch` | `x-api-key` header or `api_key` body field | 202 `{ ok, count, dropped }` or 204 (beacon) | Batch event ingestion (1-500, per-event validation) |
| POST | `/v1/batch?beacon=1` | same | 204 No Content | Beacon mode for `navigator.sendBeacon()` |
| POST | `/v1/import` | `x-api-key` header or `api_key` body field | 202 `{ ok, count }` | **Temporary endpoint** — historical import (1-5000, strict validation, no billing). Will be removed once migration is complete. |

## Key Patterns

### Event Pipeline
```
SDK POST → ApiKeyGuard → RateLimitGuard → BillingGuard → Per-event Zod validation → IngestService.buildPayload()
  → Redis XADD (events:incoming)
```
UA parsing is deferred to the processor — ingest stores raw `user_agent` string in the stream payload. SDK context fields (browser, os, device_type) are passed through as-is if present.

### Guard Chain
- **`ApiKeyGuard`** — validates API key format (printable ASCII, ≤128 chars) before any IO, then authenticates via SHA-256 hash lookup (300s Redis cache, DB fallback). Sets `request.projectId`, `request.eventsLimit`, and initializes `request.quotaLimited = false`. Checks both `expires_at` and `revoked_at` on cache hit and DB path — revoked keys are immediately rejected even from cache. Redis cache read errors fall back to DB-only auth; cache write errors are fire-and-forget.
- **`RateLimitGuard`** — per-project sliding window rate limit. 60s window split into 6x10s Redis buckets, `MGET` to sum. Returns 429 `{ retry_after }` if >= 100K events/min. Guard only reads; counter incremented fire-and-forget by `IngestService` after successful write. Applied to both `/v1/batch` and `/v1/import`. **Fails open** on Redis errors (allows request through).
- **`BillingGuard`** — reads `request.eventsLimit` set by ApiKeyGuard, checks Redis billing counter, sets `request.quotaLimited = true` if exceeded (returns 200 with `quota_limited: true` to prevent SDK retries). Only applied to `/v1/batch`. **Fails open** on Redis errors.

### Billing Quota
Returns `200 { ok: true, quota_limited: true }` instead of 429 when quota exceeded (PostHog pattern). This prevents SDKs from retrying on quota limits.

### Env Validation
`env.ts` validates `process.env` via Zod at startup (`main.ts` calls `validateEnv()` before `NestFactory.create()`). Fail-fast with formatted error on missing `DATABASE_URL`. Lazy `env()` getter is used in `app.module.ts` providers/config.

### Beacon Support
`?beacon=1` query param returns 204 No Content (for `navigator.sendBeacon()`). Events are still processed normally, but no response body is sent. Works with quota_limited too.

### Gzip Handling
- **Explicit gzip**: `Content-Encoding: gzip` — decompressed with 5MB size limit (bomb protection)
- **Auto-detect**: Non-JSON content types checked for gzip magic bytes (`0x1f 0x8b`) — transparent decompression even without Content-Encoding header
- **Body read timeout**: All request streams are wrapped with a 30s per-chunk read timeout (`BODY_READ_TIMEOUT_MS`) that destroys stalled connections (protects against mobile clients that stop sending data mid-upload)

### Client Event IDs (Deduplication)
`TrackEventSchema` accepts an optional `event_id` (UUID) from the SDK. If provided, ingest uses it as-is; otherwise generates a server-side UUIDv7. This enables deduplication: when SDK retries a batch on 503, events keep their original IDs. Both `@qurvo/sdk-browser` and `@qurvo/sdk-node` generate `event_id` per event before enqueueing. Uses UUIDv7 (time-ordered) for `batch_id`. Better for ClickHouse merge tree ordering.

### Illegal distinct_id Blocklist
`TrackEventSchema` rejects events with garbage `distinct_id` values (`null`, `undefined`, `anonymous`, `guest`, `NaN`, `[object Object]`, `0`, etc.) at Zod validation level. This is defense-in-depth — the processor also has a matching blocklist. Prevents SDK integration bugs from corrupting person identity data.

### Stream Schema Versioning
Every event written to Redis Stream includes `schema_version: '1'` (`STREAM_SCHEMA_VERSION` constant). This enables backward-compatible payload migrations for in-flight events during rolling deploys. Bump the version when payload shape changes.

### Per-Event Validation (Soft Validation)
Batch endpoint validates each event individually via `TrackEventSchema.safeParse()`. Valid events are ingested, invalid events are dropped with a structured warning log (includes up to 5 validation error details with paths and messages for SDK debugging). Response includes `dropped` count. If ALL events are invalid → 400. Import endpoint uses strict batch-level validation (all-or-nothing).

### Payload Enrichment
`buildPayload()` merges SDK event with server-side context via `BuildPayloadOpts`. Context fields are destructured with defaults to avoid repetitive optional chaining:
- `schema_version`, `event_id` (client-provided or server UUIDv7), `project_id`, `timestamp`
- `user_agent` (raw User-Agent header — UA parsing deferred to processor)
- SDK context fields passed through: `browser`, `os`, `device_type`, etc. (empty string default if SDK doesn't send them)
- Server context: `ip`, `url`, `referrer`, `page_title`, `page_path`

### Batch Writes
Batch endpoint uses `redis.pipeline()` for atomic multi-event writes to the stream.

### Validation Schemas
- `BatchWrapperSchema` — loose wrapper: validates array structure (1-500 items) + `sent_at`, events are `z.unknown()`
- `TrackEventSchema` — per-event schema with all field validations, optional `event_id` (UUID) for client-side dedup
- `ImportEventSchema` extends `TrackEventSchema` — makes `timestamp` required

`ZodExceptionFilter` (registered as `APP_FILTER`) converts `ZodError` to 400 with field-level details (applies to import endpoint and batch wrapper validation).

### Timestamp Drift Cap
`resolveTimestamp()` caps the offset at `MAX_TIMESTAMP_DRIFT_MS` (48 hours). Events queued on the client for longer than 48h before being sent are timestamped at server time. This prevents events from being backdated beyond ClickHouse TTL expectations.

### Stream Backpressure
Before writing to the Redis stream, `IngestService` checks `XLEN` against `STREAM_BACKPRESSURE_THRESHOLD` (900K, 90% of MAXLEN). The XLEN result is cached for `BACKPRESSURE_CACHE_TTL_MS` (3s) to avoid a Redis RTT on every request. If the stream is near capacity — meaning the processor is behind — writes are rejected with 503 to prevent silent data loss from approximate MAXLEN trimming.

### Billing Counter Expiry
Billing counters use `EXPIREAT` with an absolute timestamp (end-of-month + 5 days) instead of relative `EXPIRE`. This is idempotent — calling EXPIREAT multiple times sets the same absolute timestamp instead of resetting a sliding TTL window.

### Error Handling: Retryable vs Non-Retryable
`callOrThrow503()` wraps service calls with `Promise.race` against `HANDLER_TIMEOUT_MS` (30s) — Redis stream write failures, backpressure, and handler timeouts → **503** `{ retryable: true }` (signals SDK to retry with backoff). All other errors (validation, auth) remain 4xx (SDK drops batch, no retry). This pairs with `NonRetryableError` in `@qurvo/sdk-core`. Partial Redis pipeline failures are logged with sample errors for debugging.

### Event Type Mapping
`EVENT_TYPE_MAP` maps SDK event names to ClickHouse `event_type`: `$identify` → `identify`, `$pageview` → `pageview`, `$pageleave` → `pageleave`, `$set` → `set`, `$set_once` → `set_once`, `$screen` → `screen`, everything else → `track`.

### Module Configuration
`AppModule` registers all guards (`ApiKeyGuard`, `RateLimitGuard`, `BillingGuard`) as explicit providers. Implements `OnApplicationShutdown` for clean Redis and PostgreSQL pool disconnect.

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — this is the Datadog APM tracer. It is loaded at runtime via Node.js `-r` flag (`node -r ./dist/tracer.js`), so it has no explicit imports in the source code. This is NOT dead code.

## Tests

### Unit tests
`src/ingest/ingest.service.test.ts` — 9 tests for `resolveTimestamp` (PostHog-style clock-drift correction):
- Missing clientTs / sentAt fallback, clock drift correction, positive/negative drift, negative offset guard, zero offset, 48h drift cap, within-cap allowance

### Integration tests
`src/test/ingest/`. 39 tests covering:
- Batch: 202 + multi-event write, 400 empty array, gzip batch, invalid gzip, 401 no key, per-event validation (partial success), all-invalid batch → 400
- Import: 202 + multi-event write, event_id preservation, no billing counter increment, 400 missing timestamp, batch_id prefix
- Health: 200 status ok
- API key auth: api_key in body, 401 non-existent key, 401 expired key (DB), 401 revoked key, 401 expired key (Redis cache), 401 revoked key (Redis cache)
- Billing guard: 200 + quota_limited over limit, 204 quota_limited beacon, 202 under limit, billing counter increment
- Beacon: 204 No Content with ?beacon=1
- Gzip auto-detect: compressed body without Content-Encoding header
- Illegal distinct_id: drops events with illegal values, 400 when all illegal, rejects in import
- Schema version: schema_version field present in stream payload
- UUIDv7: event_id format validation, client event_id preservation
- Max batch size: 400 on >500 batch events, 400 on >5000 import events
- User-Agent passthrough: raw UA stored in stream, SDK context fields passed through, UA parsing deferred to processor
- Rate limiting: 429 when exceeded, 202 under limit, 429 on import when exceeded, counter increment
