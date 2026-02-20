# ==============================================================================
# Multi-stage Dockerfile for shot-analytics monorepo
#
# Build NestJS apps (api, ingest, processor):
#   docker build --target nestjs --build-arg APP=api -t shot-api .
#   docker build --target nestjs --build-arg APP=ingest -t shot-ingest .
#   docker build --target nestjs --build-arg APP=processor -t shot-processor .
#
# Build web (nginx + SPA):
#   docker build --target web -t shot-web .
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
COPY apps/web/package.json                     apps/web/
COPY packages/@shot/db/package.json            packages/@shot/db/
COPY packages/@shot/clickhouse/package.json    packages/@shot/clickhouse/
COPY packages/@shot/sdk-core/package.json      packages/@shot/sdk-core/
COPY packages/@shot/sdk-browser/package.json   packages/@shot/sdk-browser/
COPY packages/@shot/sdk-node/package.json      packages/@shot/sdk-node/
COPY packages/@shot/tsconfig/package.json      packages/@shot/tsconfig/
COPY packages/@shot/eslint-config/package.json packages/@shot/eslint-config/
COPY packages/@shot/testing/package.json       packages/@shot/testing/

RUN pnpm install --frozen-lockfile

# Copy all source code
COPY . .

# ==============================================================================
# Stage: nestjs-builder — build target NestJS app + dependencies
# ==============================================================================
FROM base AS nestjs-builder

ARG APP

RUN pnpm --filter @shot/${APP}... build

# ==============================================================================
# Stage: nestjs — production runtime for api/ingest/processor
# ==============================================================================
FROM node:22-alpine AS nestjs

ARG APP
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate && \
    apk add --no-cache dumb-init

WORKDIR /repo

# Copy manifests for production install (exclude @shot/testing)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/${APP}/package.json                  apps/${APP}/
COPY packages/@shot/db/package.json            packages/@shot/db/
COPY packages/@shot/clickhouse/package.json    packages/@shot/clickhouse/
COPY packages/@shot/sdk-core/package.json      packages/@shot/sdk-core/
COPY packages/@shot/sdk-browser/package.json   packages/@shot/sdk-browser/
COPY packages/@shot/sdk-node/package.json      packages/@shot/sdk-node/
COPY packages/@shot/tsconfig/package.json      packages/@shot/tsconfig/
COPY packages/@shot/eslint-config/package.json packages/@shot/eslint-config/

RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=nestjs-builder /repo/apps/${APP}/dist                   apps/${APP}/dist/
COPY --from=nestjs-builder /repo/packages/@shot/db/dist             packages/@shot/db/dist/
COPY --from=nestjs-builder /repo/packages/@shot/db/drizzle          packages/@shot/db/drizzle/
COPY --from=nestjs-builder /repo/packages/@shot/clickhouse/dist     packages/@shot/clickhouse/dist/
COPY --from=nestjs-builder /repo/packages/@shot/sdk-core/dist       packages/@shot/sdk-core/dist/
COPY --from=nestjs-builder /repo/packages/@shot/sdk-browser/dist    packages/@shot/sdk-browser/dist/
COPY --from=nestjs-builder /repo/packages/@shot/sdk-node/dist       packages/@shot/sdk-node/dist/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

WORKDIR /repo/apps/${APP}

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

# ==============================================================================
# Stage: web-builder — build SPA
# ==============================================================================
FROM base AS web-builder

RUN pnpm --filter @shot/web... build

# ==============================================================================
# Stage: web — nginx serving SPA
# ==============================================================================
FROM nginx:1.27-alpine AS web

RUN rm /etc/nginx/conf.d/default.conf

COPY --from=web-builder /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80
