# ==============================================================================
# Multi-stage Dockerfile for qurvo-analytics monorepo
#
# Build NestJS apps:
#   docker build --target nestjs --build-arg APP=api -t qurvo-api .
#   docker build --target nestjs --build-arg APP=ingest -t qurvo-ingest .
#   docker build --target nestjs --build-arg APP=processor -t qurvo-processor .
#   docker build --target nestjs --build-arg APP=cohort-worker -t qurvo-cohort-worker .
#   docker build --target nestjs --build-arg APP=billing-worker -t qurvo-billing-worker .
#
# Build web (nginx + SPA):
#   docker build --target web -t qurvo-web .
#
# Build landing (nginx + static landing page):
#   docker build --target landing -t qurvo-landing .
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
# Stage: nestjs-builder — build target NestJS app + all its dependencies
# ==============================================================================
FROM base AS nestjs-builder

ARG APP

# pnpm --filter @qurvo/${APP}... builds the app AND all transitive workspace deps
RUN pnpm --filter @qurvo/${APP}... build

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
