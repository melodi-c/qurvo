# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Восстановление после compact

Если контекст диалога был сжат (compact) и до сжатия выполнялся скилл `issue-executor` —
немедленно перечитай инструкции скилла через Read tool: `.claude/skills/issue-executor`
После прочтения продолжи с того шага, на котором остановился.

## Commands

```bash
# Start all services
pnpm dev

# Run a single app
pnpm --filter @qurvo/api dev
pnpm --filter @qurvo/ingest dev
pnpm --filter @qurvo/processor dev
pnpm --filter @qurvo/cohort-worker dev
pnpm --filter @qurvo/billing-worker dev
pnpm --filter @qurvo/insights-worker dev
pnpm --filter @qurvo/monitor-worker dev
pnpm --filter @qurvo/scheduled-jobs-worker dev
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

# Publishing SDK packages to npm
# IMPORTANT: Always use `pnpm publish`, never `npm publish`!
# pnpm auto-resolves workspace:* → real version. npm does not.
pnpm --filter @qurvo/sdk-core publish --access public --no-git-checks
pnpm --filter @qurvo/sdk-browser publish --access public --no-git-checks
pnpm --filter @qurvo/sdk-node publish --access public --no-git-checks
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
- **`@qurvo/cohort-worker`** — Background worker. Periodically recomputes dynamic cohort memberships. See `apps/cohort-worker/CLAUDE.md`.
- **`@qurvo/billing-worker`** — Background worker. Periodically checks billing counters and populates `billing:quota_limited` Redis Set for ingest. See `apps/billing-worker/CLAUDE.md`.
- **`@qurvo/insights-worker`** — Background worker. Runs every 24 hours. Detects significant metric changes and newly appearing events across all projects using ClickHouse queries; persists findings as `ai_insights` rows in PostgreSQL. See `apps/insights-worker/CLAUDE.md`.
- **`@qurvo/monitor-worker`** — Background worker. Runs every hour. Evaluates active user-configured monitors for statistical anomalies (z-score model, 29-day baseline) and dispatches Slack/email alerts when the threshold is exceeded. See `apps/monitor-worker/CLAUDE.md`.
- **`@qurvo/scheduled-jobs-worker`** — Background worker. Runs every hour. Executes AI-powered scheduled jobs (daily/weekly/monthly cadence) by calling OpenAI with a user-defined prompt and delivering results via Slack or email. See `apps/scheduled-jobs-worker/CLAUDE.md`.
- **`@qurvo/web`** (port 5173) — React SPA dashboard. See `apps/web/CLAUDE.md`.

### Deployment

Production runs exclusively on Kubernetes — there are no other deployment targets (no bare-metal, no serverless, no docker-compose in prod).

Deploy via `./deploy.sh` from repo root. Builds Docker images, pushes to GHCR, deploys with Helm.

```bash
./deploy.sh              # full: build + push + deploy (tag = current commit hash)
./deploy.sh --skip-build # deploy only (images must already exist in registry)
./deploy.sh --tag v1.0   # use custom tag instead of git commit hash
```

- Dockerfile: `Dockerfile` (multi-stage, root of repo)
- Registry: `ghcr.io/melodi-c/qurvo/{api,ingest,processor,cohort-worker,web}`
- Helm release: `qurvo` in `default` namespace
- Helm chart: `k8s/qurvo-analytics/`
- Kubeconfig: `k8s/qurvo-analytics/config.yaml`
- Values: `k8s/qurvo-analytics/values.yaml` (defaults) + `values.production.yaml` (prod overrides) + `values.local-secrets.yaml` (secrets, gitignored)
- Datadog: `k8s/datadog/values-datadog.yaml`
- Deploy templates: `k8s/qurvo-analytics/templates/{api,ingest,processor,cohort-worker,web,landing}/deployment.yaml`
- Migrations (Helm pre-install hooks): `k8s/qurvo-analytics/templates/migrate-pg.yaml`, `migrate-ch.yaml`
- Ingress: `k8s/qurvo-analytics/templates/ingress-app.yaml`, `ingress-ingest.yaml`, `ingress-landing.yaml`
- Builds all images in parallel, pushes in parallel, then `helm upgrade --install --wait --timeout 5m`

### Shared Packages

Each package has its own `CLAUDE.md` with detailed docs.

- **`@qurvo/db`** — Drizzle ORM schema + PostgreSQL client
- **`@qurvo/clickhouse`** — ClickHouse client factory, `Event` type, versioned migration system
- **`@qurvo/sdk-core`** — fetch-based transport with queue
- **`@qurvo/sdk-browser`** / **`@qurvo/sdk-node`** — platform-specific SDK wrappers
- **`@qurvo/distributed-lock`** — Redis-based distributed lock (SET NX + Lua-guarded release). Used by processor's DLQ replay and cohort-worker's membership service.
- **`@qurvo/worker-core`** — shared worker bootstrap (`bootstrapWorker()`), logger factory (`workerLoggerModule()`), periodic timer mixin (`PeriodicWorkerMixin`). Used by processor, billing-worker, cohort-worker, insights-worker, monitor-worker, scheduled-jobs-worker.
- **`@qurvo/testing`** — shared testcontainers + per-worker DB isolation + factories + date helpers. See `packages/@qurvo/testing/CLAUDE.md`

### Web i18n — обязательное требование

**Все user-visible строки в `@qurvo/web` ОБЯЗАНЫ использовать `t()`.** Хардкод на английском или русском языке в JSX — запрещён.

Система: `useLocalTranslation(translations)` + `.translations.ts` файл рядом с компонентом. Подробности в `apps/web/CLAUDE.md` → раздел Internationalization.

### Integration Tests

```bash
# Per-app
pnpm --filter @qurvo/api exec vitest run --config vitest.integration.config.ts
pnpm --filter @qurvo/ingest exec vitest run --config vitest.integration.config.ts
pnpm --filter @qurvo/processor exec vitest run --config vitest.integration.config.ts
pnpm --filter @qurvo/cohort-worker exec vitest run --config vitest.integration.config.ts
pnpm --filter @qurvo/billing-worker exec vitest run --config vitest.integration.config.ts
pnpm --filter @qurvo/insights-worker exec vitest run --config vitest.integration.config.ts
pnpm --filter @qurvo/monitor-worker exec vitest run --config vitest.integration.config.ts
pnpm --filter @qurvo/scheduled-jobs-worker exec vitest run --config vitest.integration.config.ts
```

Each app uses `createGlobalSetup()` from `@qurvo/testing` in its `globalSetup`. This starts **3 shared containers** (PG, Redis, CH) once in the main process, then vitest forks (up to `maxForks: 4`) each create isolated databases (`qurvo_worker_N`) and Redis DB N. No `singleFork` — tests run in parallel across forks.
