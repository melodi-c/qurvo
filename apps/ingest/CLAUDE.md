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
├── app.module.ts        # Root: InfrastructureModule, LoggerModule, ThrottlerModule, IngestModule, ZodExceptionFilter
├── main.ts              # Bootstrap (Fastify, CORS: '*', gzip preParsing hook, port 3001)
├── constants.ts         # REDIS_STREAM_EVENTS, REDIS_STREAM_MAXLEN
├── infrastructure/      # @Global: REDIS + DRIZZLE providers
├── ingest/
│   ├── ingest.controller.ts  # POST /v1/track, POST /v1/batch, POST /v1/import
│   ├── ingest.service.ts     # Event building + Redis stream writing
│   └── ingest.module.ts      # IngestModule
├── guards/
│   └── api-key.guard.ts      # Validates x-api-key header against DB
├── decorators/
│   └── project-id.decorator.ts  # Extracts projectId from validated key
├── filters/
│   └── zod-exception.filter.ts  # Maps ZodError → 400
├── schemas/
│   ├── event.ts              # TrackEventSchema, BatchEventsSchema (Zod)
│   └── import-event.ts       # ImportEventSchema (extends TrackEventSchema), ImportBatchSchema
├── throttler/
│   └── redis-throttler.storage.ts  # Distributed rate limiting
└── test/                # Integration tests
    ├── setup.ts
    ├── helpers/
    └── ingest/
```

## Endpoints

| Method | Path | Auth | Throttle | Response | Description |
|---|---|---|---|---|---|
| POST | `/v1/track` | `x-api-key` | Yes | 202 `{ ok: true }` | Single event ingestion |
| POST | `/v1/batch` | `x-api-key` | Yes | 202 `{ ok: true, count }` | Batch event ingestion (1-500) |
| POST | `/v1/import` | `x-api-key` | No | 202 `{ ok: true, count }` | Historical import (1-5000, no billing) |

## Key Patterns

### Event Pipeline
```
SDK POST → ApiKeyGuard → Zod validation → IngestService.buildPayload()
  → UA parsing (ua-parser-js) → Redis XADD (events:incoming)
```

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
- Backed by `RedisThrottlerStorage` (sorted sets)

### Validation
Zod schemas (`TrackEventSchema`, `BatchEventsSchema`, `ImportBatchSchema`) validate payloads. `ZodExceptionFilter` (registered as `APP_FILTER` in `AppModule`) converts `ZodError` to 400 with field-level details.

`ImportEventSchema` extends `TrackEventSchema` via `.extend()` — makes `timestamp` required and adds optional `event_id`.

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — this is the Datadog APM tracer. It is loaded at runtime via Node.js `-r` flag (`node -r ./dist/tracer.js`), so it has no explicit imports in the source code. This is NOT dead code.

## Integration Tests

Tests in `src/test/ingest/`. 15 tests covering:
- Track: 202 + stream write, enrichment, 401 invalid key, 400 missing fields
- Batch: 202 + multi-event write, 400 empty array, gzip batch, gzip single, invalid gzip, 401 no key
- Import: 202 + multi-event write, event_id preservation, no billing counter increment, 400 missing timestamp, batch_id prefix
