# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start all services
pnpm dev

# Run a single app
pnpm --filter @qurvo/api dev
pnpm --filter @qurvo/ingest dev
pnpm --filter @qurvo/processor dev
pnpm --filter @qurvo/web dev

# Build
pnpm build
pnpm --filter @qurvo/api build

# Infrastructure (PostgreSQL, Redis, ClickHouse via Docker)
pnpm infra:up
pnpm infra:down

# Database migrations
pnpm --filter @qurvo/db db:generate   # generate Drizzle SQL from schema
pnpm --filter @qurvo/db db:migrate    # apply PostgreSQL migrations
pnpm ch:migrate                      # apply ClickHouse migration

# API client generation (requires api to be built first)
pnpm swagger:generate                # generate apps/api/docs/swagger.json
pnpm generate-api                    # generate apps/web/src/api/generated/Api.ts from swagger.json
```

## Architecture

### Event Pipeline

```
SDK (@qurvo/sdk-browser | @qurvo/sdk-node)
  → POST /ingest (apps/ingest, port 3001, auth: x-api-key header)
  → Redis Stream (events:incoming)
  → apps/processor (consumer group: processor-group)
  → ClickHouse (events table, batched flush every 5s or 1000 events)
```

The processor uses `XREADGROUP` with a consumer group for reliable delivery. Failed batches are retried 3 times then moved to `events:dlq`. Pending messages (idle >60s) are reclaimed via `XAUTOCLAIM` every 30s.

### API Service (port 3000)

REST API for the dashboard. Auth via `Authorization: Bearer <token>` (session tokens). Modules: `Auth`, `Projects`, `ApiKeys`, `Analytics`. All providers (`DRIZZLE`, `CLICKHOUSE`, `REDIS`) are registered in the global `DatabaseModule`.

Session tokens are random bytes stored as SHA-256 hashes in PostgreSQL. Redis caches verified sessions for 60s to avoid DB hits on every request.

API keys (for SDK/ingest auth) are stored as SHA-256 hashes. Redis caches valid keys similarly.

### Frontend (port 5173)

React SPA with client-side routing. Auth state in Zustand store (`src/stores/auth.ts`). API calls via generated typed client (`src/api/generated/Api.ts`). Protected routes check `useAuthStore` for authenticated user.

Pages: Dashboard (analytics overview), Projects, API Keys, Events explorer.

### Shared Packages

- `@qurvo/db` — Drizzle ORM schema + PostgreSQL client. Tables: `users`, `sessions`, `projects`, `api_keys`, `project_members`
- `@qurvo/clickhouse` — ClickHouse client factory (`createClickHouse`) and `Event` type. Query functions are **not** in this package — they live in their consuming app (`apps/api/src/analytics/queries.ts`)
- `@qurvo/sdk-core` — fetch-based transport with queue, base types
- `@qurvo/sdk-browser` / `@qurvo/sdk-node` — platform-specific SDK wrappers

### ClickHouse Schema

Three objects defined in `packages/@qurvo/clickhouse/src/migration.sql`:

- **`events`** — `ReplacingMergeTree(ingested_at)`, partitioned by `toYYYYMM(timestamp)`, ordered by `(project_id, event_name, timestamp, event_id)`, TTL 365 days. `properties` and `user_properties` stored as JSON strings. Use `SELECT ... FROM events FINAL` in queries to deduplicate.
- **`person_distinct_id_overrides`** — `ReplacingMergeTree(version)`, ordered by `(project_id, distinct_id)`. Written by the processor when `$identify` events merge an anonymous user into a known user.
- **`person_overrides_dict`** — ClickHouse dictionary backed by `person_distinct_id_overrides`, refreshed every 30–60s. Used in queries via `dictGetOrNull('qurvo_analytics.person_overrides_dict', 'person_id', (project_id, distinct_id))` to resolve the canonical `person_id` at query time without JOINs (PostHog-style "Persons on Events").

### Processor (NestJS app)

The processor is a full NestJS application with `ProcessorModule`. Key services:

- **`EventConsumerService`** — `XREADGROUP` loop; reclaims pending messages via `XAUTOCLAIM` every 30s
- **`FlushService`** — buffers events and flushes to ClickHouse every 5s or when buffer reaches 1000 events; retries failed batches 3× then moves to DLQ
- **`PersonResolverService`** — resolves `person_id` for each event using Redis as a write-through cache; handles `$identify` by writing overrides to `person_distinct_id_overrides`

## Key Patterns

**NestJS providers**: Infrastructure dependencies (`DRIZZLE`, `CLICKHOUSE`, `REDIS`) are injected as custom provider tokens. Use `@Inject(DRIZZLE)` etc., not constructor autowiring.

**API client generation workflow**: Edit `@qurvo/api` controllers → `pnpm swagger:generate` → `pnpm generate-api` → use updated `Api.ts` in frontend. The generated client strips `Dto` suffix from type names.

**Throttle limits**: Ingest is more permissive (50 req/s, 1000/min) than API (20 req/s, 300/min). Both use `RedisThrottlerStorage` (`apps/api/src/throttler/redis-throttler.storage.ts`) for distributed rate limiting backed by Redis sorted sets.

**Exception layering**: Services must not import or throw anything HTTP-specific (`HttpException`, `HttpStatus`). Domain exceptions extend plain `Error` and live inside their own module (e.g. `auth/exceptions/`). There is no shared `src/exceptions/` dump — every exception belongs to the module that owns it.

**Filter placement**: All `ExceptionFilter` implementations live in `src/api/filters/`. Filters are registered via `APP_FILTER` provider in `ApiModule`, never via `app.useGlobalFilters()` in `main.ts`.

**Module cohesion**: All code is grouped by module. Controllers, services, guards, filters, and exceptions for a feature all live inside that feature's directory. No cross-cutting `src/filters/`, `src/exceptions/`, or similar dumps.
