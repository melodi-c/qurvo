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
├── main.ts              # Bootstrap (Fastify, CORS: '*', gzip preParsing hook, port 3001)
├── constants.ts         # REDIS_STREAM_EVENTS, REDIS_STREAM_MAXLEN, billing keys
├── ingest/
│   ├── ingest.controller.ts  # GET /health, POST /v1/batch, POST /v1/import
│   ├── ingest.service.ts     # Event building + Redis stream writing
│   └── ingest.service.test.ts # Unit tests (resolveTimestamp)
├── guards/
│   ├── api-key.guard.ts      # Validates API key (header or body) against DB, caches in Redis
│   └── billing.guard.ts      # Checks monthly event limit, returns quota_limited response
├── decorators/
│   └── project-id.decorator.ts  # @ProjectId() param decorator — reads request.projectId
├── filters/
│   └── zod-exception.filter.ts  # Maps ZodError → 400
├── schemas/
│   ├── event.ts              # TrackEventSchema, BatchWrapperSchema, BatchEventsSchema (Zod)
│   └── import-event.ts       # ImportEventSchema (extends TrackEventSchema), ImportBatchSchema
├── hooks/
│   └── gzip-preparsing.ts    # Fastify preParsing hook for gzip decompression
├── types/
│   └── fastify.d.ts          # Fastify request augmentation (projectId, eventsLimit)
└── test/                # Integration tests
    ├── setup.ts
    ├── helpers/
    └── ingest/
```

## Endpoints

| Method | Path | Auth | Response | Description |
|---|---|---|---|---|
| GET | `/health` | No | 200 `{ status: 'ok' }` | Health check |
| POST | `/v1/batch` | `x-api-key` header or `api_key` body field | 202 `{ ok, count, dropped }` | Batch event ingestion (1-500, per-event validation) |
| POST | `/v1/import` | `x-api-key` header or `api_key` body field | 202 `{ ok, count }` | Historical import (1-5000, strict validation, no billing) |

## Key Patterns

### Event Pipeline
```
SDK POST → ApiKeyGuard → BillingGuard → Per-event Zod validation → IngestService.buildPayload()
  → UA parsing (ua-parser-js) → Redis XADD (events:incoming)
```

### Guard Chain
- **`ApiKeyGuard`** — authenticates API key from `x-api-key` header or `api_key` body field (SHA-256 hash lookup, 60s Redis cache, DB fallback), sets `request.projectId` and `request.eventsLimit`
- **`BillingGuard`** — reads `request.eventsLimit` set by ApiKeyGuard, checks Redis billing counter, returns 429 with `{ quota_limited: true }` if exceeded. Only applied to `/v1/batch`.

### Per-Event Validation (Soft Validation)
Batch endpoint validates each event individually via `TrackEventSchema.safeParse()`. Valid events are ingested, invalid events are dropped with a warning log. Response includes `dropped` count. If ALL events are invalid → 400. Import endpoint uses strict batch-level validation (all-or-nothing).

### Billing Quota
No per-IP rate limiting — billing quota per project is the only throttle. When exceeded, returns `{ quota_limited: true }` so SDKs can stop sending. DDoS protection should be at the reverse proxy/CDN layer.

### Payload Enrichment
`buildPayload()` merges SDK event with server-side context via `BuildPayloadOpts`:
- `event_id` (UUID), `project_id`, `timestamp`
- UA fields: `browser`, `browser_version`, `os`, `os_version`, `device_type`
- Context: `ip`, `url`, `referrer`, `page_title`, `page_path`

### Batch Writes
Batch endpoint uses `redis.pipeline()` for atomic multi-event writes to the stream.

### Validation Schemas
- `BatchWrapperSchema` — loose wrapper: validates array structure (1-500 items) + `sent_at`, events are `z.unknown()`
- `TrackEventSchema` — per-event schema with all field validations
- `ImportEventSchema` extends `TrackEventSchema` — makes `timestamp` required, adds optional `event_id`

`ZodExceptionFilter` (registered as `APP_FILTER`) converts `ZodError` to 400 with field-level details (applies to import endpoint and batch wrapper validation).

### Module Configuration
`AppModule` implements `OnApplicationShutdown` for clean Redis and PostgreSQL pool disconnect.

## Important: Do NOT Delete

- **`src/tracer.ts`** and the `dd-trace` dependency — this is the Datadog APM tracer. It is loaded at runtime via Node.js `-r` flag (`node -r ./dist/tracer.js`), so it has no explicit imports in the source code. This is NOT dead code.

## Tests

### Unit tests
`src/ingest/ingest.service.test.ts` — 7 tests for `resolveTimestamp` (PostHog-style clock-drift correction):
- Missing clientTs / sentAt fallback, clock drift correction, positive/negative drift, negative offset guard, zero offset

### Integration tests
`src/test/ingest/`. 21 tests covering:
- Batch: 202 + multi-event write, 400 empty array, gzip batch, invalid gzip, 401 no key, per-event validation (partial success), all-invalid batch → 400
- Import: 202 + multi-event write, event_id preservation, no billing counter increment, 400 missing timestamp, batch_id prefix
- Health: 200 status ok
- API key auth: api_key in body, 401 non-existent key, 401 expired key (DB), 401 revoked key, 401 expired key (Redis cache)
- Billing guard: 429 + quota_limited over limit, 202 under limit, billing counter increment
