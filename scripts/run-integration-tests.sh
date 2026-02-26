#!/usr/bin/env bash
# Thin wrapper around vitest integration tests.
# File-level locking is now handled inside createGlobalSetup() from @qurvo/testing,
# so there is no need for flock here.
set -euo pipefail

APP="${1:?Usage: run-integration-tests.sh <app-name>}"

echo "[test:$APP] Starting integration tests..."
pnpm --filter "@qurvo/$APP" exec vitest run \
  --config vitest.integration.config.ts
