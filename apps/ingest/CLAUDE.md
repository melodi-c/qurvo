# Ingest App

NestJS event collection service. Port 3001. Receives SDK events, validates, enriches, writes to Redis Stream.

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
├── app.module.ts        # Root: REDIS + DRIZZLE providers, LoggerModule, ThrottlerModule, guards, filters, graceful shutdown
├── main.ts              # Bootstrap (Fastify, CORS: '*', gzip preParsing hook, port 3001)
├── constants.ts         # REDIS_STREAM_EVENTS, REDIS_STREAM_MAXLEN, billing keys
├── ingest/
│   ├── ingest.controller.ts  # GET /health, POST /v1/batch, POST /v1/import
│   └── ingest.service.ts     # Event building + Redis stream writing
├── guards/
│   ├── api-key.guard.ts      # Validates x-api-key header against DB, caches in Redis
│   └── billing.guard.ts      # Checks monthly event limit from Redis billing counter
├── decorators/
│   └── project-id.decorator.ts  # @ProjectId() param decorator — reads request.projectId
├── filters/
│   └── zod-exception.filter.ts  # Maps ZodError → 400
├── schemas/
│   ├── event.ts              # TrackEventSchema, BatchEventsSchema (Zod)
│   └── import-event.ts       # ImportEventSchema (extends TrackEventSchema), ImportBatchSchema
├── hooks/
│   └── gzip-preparsing.ts    # Fastify preParsing hook for gzip decompression
├── throttler/
│   └── redis-throttler.storage.ts  # Distributed rate limiting (INCR + PEXPIRE)
└── test/                # Integration tests
    ├── setup.ts
    ├── helpers/
    └── ingest/
```

## Endpoints

| Method | Path | Auth | Throttle | Response | Description |
|---|---|---|---|---|---|
| GET | `/health` | No | No | 200 `{ status: 'ok' }` | Health check |
| POST | `/v1/batch` | `x-api-key` | Yes | 202 `{ ok: true, count }` | Batch event ingestion (1-500) |
| POST | `/v1/import` | `x-api-key` | No | 202 `{ ok: true, count }` | Historical import (1-5000, no billing) |

## Key Patterns

### Event Pipeline
```
SDK POST → ApiKeyGuard → BillingGuard → Zod validation → IngestService.buildPayload()
  → UA parsing (ua-parser-js) → Redis XADD (events:incoming)
```

### Guard Chain
- **`ApiKeyGuard`** — authenticates API key (SHA-256 hash lookup, 60s Redis cache, DB fallback), sets `request.projectId` and `request.eventsLimit`
- **`BillingGuard`** — reads `request.eventsLimit` set by ApiKeyGuard, checks Redis billing counter, returns 429 if exceeded. Only applied to `/v1/batch`.

### Payload Enrichment
`buildPayload()` merges SDK event with server-side context via `BuildPayloadOpts`:
- `event_id` (UUID), `project_id`, `timestamp`
- UA fields: `browser`, `browser_version`, `os`, `os_version`, `device_type`
- Context: `ip`, `url`, `referrer`, `page_title`, `page_path`

### Batch Writes
Batch endpoint uses `redis.pipeline()` for atomic multi-event writes to the stream.

### Throttling
- Short: 50 req/s per IP
- Medium: 1000 req/min per IP
- Backed by `RedisThrottlerStorage` (INCR + PEXPIRE per key)
- `/health` and `/v1/import` skip throttling via `@SkipThrottle()`

### Validation
Zod schemas (`TrackEventSchema`, `BatchEventsSchema`, `ImportBatchSchema`) validate payloads. `ZodExceptionFilter` (registered as `APP_FILTER` in `AppModule`) converts `ZodError` to 400 with field-level details.

`ImportEventSchema` extends `TrackEventSchema` via `.extend()` — makes `timestamp` required and adds optional `event_id`.

### Module Configuration
`@Global()` + `exports: [RedisProvider]` on `AppModule` is required — `ThrottlerModule.forRootAsync` injects the `REDIS` token, which must be globally exported for cross-module DI resolution.

`AppModule` implements `OnApplicationShutdown` for clean Redis disconnect.

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — this is the Datadog APM tracer. It is loaded at runtime via Node.js `-r` flag (`node -r ./dist/tracer.js`), so it has no explicit imports in the source code. This is NOT dead code.

## Integration Tests

Tests in `src/test/ingest/`. 10 tests covering:
- Batch: 202 + multi-event write, 400 empty array, gzip batch, invalid gzip, 401 no key
- Import: 202 + multi-event write, event_id preservation, no billing counter increment, 400 missing timestamp, batch_id prefix
