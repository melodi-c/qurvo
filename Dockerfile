# ==============================================================================
# Multi-stage Dockerfile for qurvo-analytics monorepo
#
# Build NestJS apps:
#   docker build --target nestjs --build-arg APP=api -t qurvo-api .
#   docker build --target nestjs --build-arg APP=ingest -t qurvo-ingest .
#   docker build --target nestjs --build-arg APP=processor -t qurvo-processor .
#   docker build --target nestjs --build-arg APP=cohort-worker -t qurvo-cohort-worker .
#   docker build --target nestjs --build-arg APP=billing-worker -t qurvo-billing-worker .
#   docker build --target nestjs --build-arg APP=monitor-worker -t qurvo-monitor-worker .
#   docker build --target nestjs --build-arg APP=insights-worker -t qurvo-insights-worker .
#   docker build --target nestjs --build-arg APP=scheduled-jobs-worker -t qurvo-scheduled-jobs-worker .
#
# Build web (nginx + SPA):
#   docker build --target web -t qurvo-web .
#
# Build landing (nginx + static landing page):
#   docker build --target landing -t qurvo-landing .
#
# Build storybook (nginx + Storybook static site):
#   docker build --target storybook -t qurvo-storybook .
#
# Adding a new app or package? No Dockerfile changes needed.
# ==============================================================================

# ==============================================================================
# Stage: manifests — extract package.json files for layer caching
#
# Rebuilds on every code change, but the OUTPUT is content-addressed by BuildKit:
# downstream pnpm install only re-runs when package.json files actually change.
# ==============================================================================
FROM node:22-alpine AS manifests

COPY . /src

RUN mkdir /out && cd /src && \
    for f in package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json; do \
      [ -f "$f" ] && cp "$f" /out/; \
    done && \
    find apps packages -name "package.json" | while IFS= read -r f; do \
      mkdir -p "/out/$(dirname "$f")" && cp "$f" "/out/$f"; \
    done

# ==============================================================================
# Stage: base — install all dependencies + copy source
# ==============================================================================
FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /repo

COPY --from=manifests /out/ .
RUN pnpm install --frozen-lockfile

# Copy all source code
COPY . .

# ==============================================================================
# Stage: packages-builder — build all shared packages once
#
# Each NestJS app depends on a subset of these packages. Building them in a
# single stage means they are compiled exactly once regardless of how many app
# stages are built in parallel, eliminating N-fold recompilation.
#
# Build order respects intra-package dependency graph:
#   Level 0 (no @qurvo deps):   db, clickhouse, worker-core, distributed-lock,
#                                heartbeat, ai-types
#   Level 1 (depends on level 0): nestjs-infra (→ db, clickhouse),
#                                  cohort-query (→ db)
# ==============================================================================
FROM base AS packages-builder

RUN pnpm --filter @qurvo/db build \
 && pnpm --filter @qurvo/clickhouse build \
 && pnpm --filter @qurvo/worker-core build \
 && pnpm --filter @qurvo/distributed-lock build \
 && pnpm --filter @qurvo/heartbeat build \
 && pnpm --filter @qurvo/ai-types build \
 && pnpm --filter @qurvo/nestjs-infra build \
 && pnpm --filter @qurvo/cohort-query build

# ==============================================================================
# Stage: nestjs-builder — build target NestJS app only (packages already built)
# ==============================================================================
FROM base AS nestjs-builder

ARG APP

# Copy pre-built package dist directories from packages-builder so pnpm can
# resolve workspace:* references without recompiling shared packages.
COPY --from=packages-builder /repo/packages/ packages/

# Build only the target app — shared packages are already compiled above.
# Use plain --filter (without ...) because transitive deps are already built.
RUN pnpm --filter @qurvo/${APP} build

# Auto-collect all built dist/ dirs + drizzle migrations into /pkg-dists
RUN mkdir -p /pkg-dists && \
    find packages/@qurvo -maxdepth 2 -name "dist" -type d -not -path "*/node_modules/*" | \
    while IFS= read -r d; do \
      mkdir -p "/pkg-dists/$(dirname "$d")" && cp -r "$d" "/pkg-dists/$d"; \
    done && \
    if [ -d packages/@qurvo/db/drizzle ]; then \
      mkdir -p /pkg-dists/packages/@qurvo/db && \
      cp -r packages/@qurvo/db/drizzle /pkg-dists/packages/@qurvo/db/; \
    fi

# ==============================================================================
# Stage: nestjs — production runtime
# ==============================================================================
FROM node:22-alpine AS nestjs

ARG APP
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate && \
    apk add --no-cache dumb-init

WORKDIR /repo

# Install only production deps for the target app + workspace packages
COPY --from=manifests /out/package.json /out/pnpm-workspace.yaml /out/pnpm-lock.yaml ./
COPY --from=manifests /out/apps/${APP}/package.json apps/${APP}/
COPY --from=manifests /out/packages/ packages/

RUN pnpm install --frozen-lockfile --prod

# Copy built app + all package dist directories (auto-collected by builder)
COPY --from=nestjs-builder /repo/apps/${APP}/dist apps/${APP}/dist/
COPY --from=nestjs-builder /pkg-dists/packages/ packages/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

WORKDIR /repo/apps/${APP}

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--require", "./dist/tracer.js", "dist/main.js"]

# ==============================================================================
# Stage: web-builder — build SPA
# ==============================================================================
FROM base AS web-builder

# Copy pre-built package dist directories so web's shared @qurvo deps resolve.
COPY --from=packages-builder /repo/packages/ packages/

RUN pnpm --filter @qurvo/web build

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

# ==============================================================================
# Stage: storybook-builder — build Storybook static site
# ==============================================================================
FROM base AS storybook-builder

# Copy pre-built package dist directories so @qurvo/web's workspace deps resolve.
COPY --from=packages-builder /repo/packages/ packages/

RUN pnpm --filter @qurvo/web run build-storybook

# ==============================================================================
# Stage: storybook — nginx serving Storybook static
# ==============================================================================
FROM nginx:1.27-alpine AS storybook

RUN rm /etc/nginx/conf.d/default.conf

COPY --from=storybook-builder /repo/apps/web/storybook-static /usr/share/nginx/html

EXPOSE 80
