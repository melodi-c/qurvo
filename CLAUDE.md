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
pnpm ch:migrate                      # apply pending ClickHouse migrations
pnpm ch:generate <name>              # create new ClickHouse migration file

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

### Apps

- **`@qurvo/api`** (port 3000) — REST API for the dashboard. Auth via bearer session tokens. See `apps/api/CLAUDE.md`.
- **`@qurvo/ingest`** (port 3001) — Event collection. Validates SDK events, writes to Redis Stream. See `apps/ingest/CLAUDE.md`.
- **`@qurvo/processor`** — Background worker. Consumes Redis Stream, resolves person identity, writes to ClickHouse. See `apps/processor/CLAUDE.md`.
- **`@qurvo/web`** (port 5173) — React SPA dashboard. See `apps/web/CLAUDE.md`.

### Deployment

Deployed directly to Kubernetes. Helm chart and connection config in `k8s/qurvo-analytics/`, main config: `k8s/qurvo-analytics/config.yaml`.

### Shared Packages

Each package has its own `CLAUDE.md` with detailed docs.

- **`@qurvo/db`** — Drizzle ORM schema + PostgreSQL client
- **`@qurvo/clickhouse`** — ClickHouse client factory, `Event` type, versioned migration system
- **`@qurvo/sdk-core`** — fetch-based transport with queue
- **`@qurvo/sdk-browser`** / **`@qurvo/sdk-node`** — platform-specific SDK wrappers
- **`@qurvo/testing`** — testcontainers (PostgreSQL, Redis, ClickHouse) + factories + date helpers
