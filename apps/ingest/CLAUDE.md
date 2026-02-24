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
├── main.ts              # Bootstrap (Fastify, CORS: '*', gzip preParsing hook, env validation, port 3001)
├── env.ts               # Zod env validation (DATABASE_URL, REDIS_URL, INGEST_PORT, LOG_LEVEL, NODE_ENV)
├── constants.ts         # REDIS_STREAM_EVENTS, REDIS_STREAM_MAXLEN, billing keys, rate limit constants, MAX_DECOMPRESSED_BYTES, BODY_READ_TIMEOUT_MS
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
| GET | `/health` | No | 200 `{ status: 'ok' }` | Health check |
| POST | `/v1/batch` | `x-api-key` header or `api_key` body field | 202 `{ ok, count, dropped }` or 204 (beacon) | Batch event ingestion (1-500, per-event validation) |
| POST | `/v1/batch?beacon=1` | same | 204 No Content | Beacon mode for `navigator.sendBeacon()` |
| POST | `/v1/import` | `x-api-key` header or `api_key` body field | 202 `{ ok, count }` | Historical import (1-5000, strict validation, no billing) |

## Key Patterns

### Event Pipeline
```
SDK POST → ApiKeyGuard → RateLimitGuard → BillingGuard → Per-event Zod validation → IngestService.buildPayload()
  → UA parsing (ua-parser-js) → Redis XADD (events:incoming)
```

### Guard Chain
- **`ApiKeyGuard`** — authenticates API key from `x-api-key` header or `api_key` body field (SHA-256 hash lookup, 300s Redis cache, DB fallback), sets `request.projectId`, `request.eventsLimit`, and initializes `request.quotaLimited = false`. Redis cache read errors fall back to DB-only auth; cache write errors are fire-and-forget.
- **`RateLimitGuard`** — per-project sliding window rate limit. 60s window split into 6x10s Redis buckets, `MGET` to sum. Returns 429 `{ retry_after }` if >= 100K events/min. Guard only reads; counter incremented fire-and-forget by `IngestService` after successful write. Only applied to `/v1/batch`. **Fails open** on Redis errors (allows request through).
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

### UUIDv7 Event IDs
Uses `uuid` v7 (time-ordered) instead of UUIDv4 for `event_id` and `batch_id`. Better for ClickHouse merge tree ordering.

### Per-Event Validation (Soft Validation)
Batch endpoint validates each event individually via `TrackEventSchema.safeParse()`. Valid events are ingested, invalid events are dropped with a warning log. Response includes `dropped` count. If ALL events are invalid → 400. Import endpoint uses strict batch-level validation (all-or-nothing).

### Payload Enrichment
`buildPayload()` merges SDK event with server-side context via `BuildPayloadOpts`:
- `event_id` (UUIDv7), `project_id`, `timestamp`
- UA fields: `browser`, `browser_version`, `os`, `os_version`, `device_type`
- Context: `ip`, `url`, `referrer`, `page_title`, `page_path`

### Batch Writes
Batch endpoint uses `redis.pipeline()` for atomic multi-event writes to the stream.

### Validation Schemas
- `BatchWrapperSchema` — loose wrapper: validates array structure (1-500 items) + `sent_at`, events are `z.unknown()`
- `TrackEventSchema` — per-event schema with all field validations
- `ImportEventSchema` extends `TrackEventSchema` — makes `timestamp` required, adds optional `event_id`

`ZodExceptionFilter` (registered as `APP_FILTER`) converts `ZodError` to 400 with field-level details (applies to import endpoint and batch wrapper validation).

### Error Handling: Retryable vs Non-Retryable
Controller wraps `IngestService` calls in try-catch. Redis stream write failures → **503** `{ retryable: true }` (signals SDK to retry with backoff). All other errors (validation, auth) remain 4xx (SDK drops batch, no retry). This pairs with `NonRetryableError` in `@qurvo/sdk-core`.

### Event Type Mapping
`EVENT_TYPE_MAP` maps SDK event names to ClickHouse `event_type`: `$identify` → `identify`, `$pageview` → `pageview`, `$pageleave` → `pageleave`, `$set` → `set`, `$set_once` → `set_once`, `$screen` → `screen`, everything else → `track`.

### Module Configuration
`AppModule` registers all guards (`ApiKeyGuard`, `RateLimitGuard`, `BillingGuard`) as explicit providers. Implements `OnApplicationShutdown` for clean Redis and PostgreSQL pool disconnect.

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — this is the Datadog APM tracer. It is loaded at runtime via Node.js `-r` flag (`node -r ./dist/tracer.js`), so it has no explicit imports in the source code. This is NOT dead code.

## Tests

### Unit tests
`src/ingest/ingest.service.test.ts` — 7 tests for `resolveTimestamp` (PostHog-style clock-drift correction):
- Missing clientTs / sentAt fallback, clock drift correction, positive/negative drift, negative offset guard, zero offset

### Integration tests
`src/test/ingest/`. 33 tests covering:
- Batch: 202 + multi-event write, 400 empty array, gzip batch, invalid gzip, 401 no key, per-event validation (partial success), all-invalid batch → 400
- Import: 202 + multi-event write, event_id preservation, no billing counter increment, 400 missing timestamp, batch_id prefix
- Health: 200 status ok
- API key auth: api_key in body, 401 non-existent key, 401 expired key (DB), 401 revoked key, 401 expired key (Redis cache)
- Billing guard: 200 + quota_limited over limit, 204 quota_limited beacon, 202 under limit, billing counter increment
- Beacon: 204 No Content with ?beacon=1
- Gzip auto-detect: compressed body without Content-Encoding header
- UUIDv7: event_id format validation
- Max batch size: 400 on >500 batch events, 400 on >5000 import events
- UA enrichment: browser/os/device from User-Agent header, SDK context overrides UA-parsed values
- Rate limiting: 429 when exceeded, 202 under limit, no rate limit on import, counter increment
