#!/usr/bin/env bash
set -euo pipefail

APP="${1:?Usage: run-integration-tests.sh <app-name>}"
LOCK_FILE="/tmp/qurvo-integration-tests.lock"
LOCK_WAIT=${QURVO_TEST_LOCK_WAIT:-1800}  # wait for lock up to 30 min

echo "[test:$APP] Waiting for integration test lock..."
flock -w "$LOCK_WAIT" "$LOCK_FILE" \
  timeout 600 \
  pnpm --filter "@qurvo/$APP" exec vitest run \
    --config vitest.integration.config.ts
