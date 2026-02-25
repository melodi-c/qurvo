# ==============================================================================
# Multi-stage Dockerfile for qurvo-analytics monorepo
#
# Build NestJS apps (api, ingest, processor, cohort-worker):
#   docker build --target nestjs --build-arg APP=api -t qurvo-api .
#   docker build --target nestjs --build-arg APP=ingest -t qurvo-ingest .
#   docker build --target nestjs --build-arg APP=processor -t qurvo-processor .
#   docker build --target nestjs --build-arg APP=cohort-worker -t qurvo-cohort-worker .
#
# Build web (nginx + SPA):
#   docker build --target web -t qurvo-web .
#
# Build landing (nginx + static landing page):
#   docker build --target landing -t qurvo-landing .
# ==============================================================================

# ==============================================================================
# Stage: base — install dependencies
# ==============================================================================
FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /repo

# Copy manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json                     apps/api/
COPY apps/ingest/package.json                  apps/ingest/
COPY apps/processor/package.json               apps/processor/
COPY apps/cohort-worker/package.json           apps/cohort-worker/
COPY apps/billing-worker/package.json          apps/billing-worker/
COPY apps/web/package.json                     apps/web/
COPY apps/landing/package.json                 apps/landing/
COPY packages/@qurvo/db/package.json            packages/@qurvo/db/
COPY packages/@qurvo/clickhouse/package.json    packages/@qurvo/clickhouse/
COPY packages/@qurvo/sdk-core/package.json      packages/@qurvo/sdk-core/
COPY packages/@qurvo/sdk-browser/package.json   packages/@qurvo/sdk-browser/
COPY packages/@qurvo/sdk-node/package.json      packages/@qurvo/sdk-node/
COPY packages/@qurvo/tsconfig/package.json      packages/@qurvo/tsconfig/
COPY packages/@qurvo/eslint-config/package.json packages/@qurvo/eslint-config/
COPY packages/@qurvo/testing/package.json       packages/@qurvo/testing/
COPY packages/@qurvo/cohort-query/package.json  packages/@qurvo/cohort-query/
COPY packages/@qurvo/distributed-lock/package.json packages/@qurvo/distributed-lock/
COPY packages/@qurvo/heartbeat/package.json packages/@qurvo/heartbeat/
COPY packages/@qurvo/nestjs-infra/package.json packages/@qurvo/nestjs-infra/

RUN pnpm install --frozen-lockfile

# Copy all source code
COPY . .

# ==============================================================================
# Stage: nestjs-builder — build target NestJS app + dependencies
# ==============================================================================
FROM base AS nestjs-builder

ARG APP

RUN pnpm --filter @qurvo/${APP}... build && \
    mkdir -p packages/@qurvo/cohort-query/dist && \
    mkdir -p packages/@qurvo/distributed-lock/dist && \
    mkdir -p packages/@qurvo/heartbeat/dist && \
    mkdir -p packages/@qurvo/nestjs-infra/dist

# ==============================================================================
# Stage: nestjs — production runtime for api/ingest/processor
# ==============================================================================
FROM node:22-alpine AS nestjs

ARG APP
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate && \
    apk add --no-cache dumb-init

WORKDIR /repo

# Copy manifests for production install (exclude @qurvo/testing)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/${APP}/package.json                  apps/${APP}/
COPY packages/@qurvo/db/package.json            packages/@qurvo/db/
COPY packages/@qurvo/clickhouse/package.json    packages/@qurvo/clickhouse/
COPY packages/@qurvo/sdk-core/package.json      packages/@qurvo/sdk-core/
COPY packages/@qurvo/sdk-browser/package.json   packages/@qurvo/sdk-browser/
COPY packages/@qurvo/sdk-node/package.json      packages/@qurvo/sdk-node/
COPY packages/@qurvo/tsconfig/package.json      packages/@qurvo/tsconfig/
COPY packages/@qurvo/eslint-config/package.json packages/@qurvo/eslint-config/
COPY packages/@qurvo/cohort-query/package.json  packages/@qurvo/cohort-query/
COPY packages/@qurvo/distributed-lock/package.json packages/@qurvo/distributed-lock/
COPY packages/@qurvo/heartbeat/package.json packages/@qurvo/heartbeat/
COPY packages/@qurvo/nestjs-infra/package.json packages/@qurvo/nestjs-infra/

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=nestjs-builder /repo/apps/${APP}/dist                   apps/${APP}/dist/
COPY --from=nestjs-builder /repo/packages/@qurvo/db/dist             packages/@qurvo/db/dist/
COPY --from=nestjs-builder /repo/packages/@qurvo/db/drizzle          packages/@qurvo/db/drizzle/
COPY --from=nestjs-builder /repo/packages/@qurvo/clickhouse/dist     packages/@qurvo/clickhouse/dist/
COPY --from=nestjs-builder /repo/packages/@qurvo/cohort-query/dist   packages/@qurvo/cohort-query/dist/
COPY --from=nestjs-builder /repo/packages/@qurvo/distributed-lock/dist packages/@qurvo/distributed-lock/dist/
COPY --from=nestjs-builder /repo/packages/@qurvo/heartbeat/dist packages/@qurvo/heartbeat/dist/
COPY --from=nestjs-builder /repo/packages/@qurvo/nestjs-infra/dist packages/@qurvo/nestjs-infra/dist/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

WORKDIR /repo/apps/${APP}

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--require", "./dist/tracer.js", "dist/main.js"]

# ==============================================================================
# Stage: web-builder — build SPA
# ==============================================================================
FROM base AS web-builder

RUN pnpm --filter @qurvo/web... build

# ==============================================================================
# Stage: web — nginx serving SPA
# ==============================================================================
FROM nginx:1.27-alpine AS web

RUN rm /etc/nginx/conf.d/default.conf

COPY --from=web-builder /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# ==============================================================================
# Stage: landing-builder — build static landing page
# ==============================================================================
FROM base AS landing-builder

RUN pnpm --filter @qurvo/landing... build

# ==============================================================================
# Stage: landing — nginx serving static landing page
# ==============================================================================
FROM nginx:1.27-alpine AS landing

RUN rm /etc/nginx/conf.d/default.conf

COPY --from=landing-builder /repo/apps/landing/dist /usr/share/nginx/html

EXPOSE 80
