#!/usr/bin/env bash
# Post-merge верификация: build + integration tests для затронутых приложений.
# Использование: bash verify-post-merge.sh <AFFECTED_APPS> <MERGED_ISSUES>
# AFFECTED_APPS: через запятую, например "api,web,processor"
# MERGED_ISSUES: через запятую, например "42,43,45"
# Вывод: ALL_GREEN или REGRESSION + детали.
set -euo pipefail

AFFECTED_APPS="$1"
MERGED_ISSUES="${2:-}"

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo "Verifying main at $(git rev-parse --short HEAD)"
echo "Affected apps: $AFFECTED_APPS"
echo "Merged issues: $MERGED_ISSUES"

IFS=',' read -ra APPS <<< "$AFFECTED_APPS"

BUILD_OK=true
BUILD_ERRORS=""
TEST_SUMMARY=""
TEST_OK=true
FLAKY_TESTS=""

# ── Build ────────────────────────────────────────────────────────────
for APP in "${APPS[@]}"; do
  APP=$(echo "$APP" | xargs)  # trim whitespace
  echo ""
  echo "=== Building @qurvo/$APP ==="
  if pnpm turbo build --filter="@qurvo/$APP" 2>&1; then
    echo "Build @qurvo/$APP: OK"
  else
    BUILD_OK=false
    BUILD_ERRORS="${BUILD_ERRORS}@qurvo/$APP "
    echo "Build @qurvo/$APP: FAILED"
  fi
done

if [[ "$BUILD_OK" == "false" ]]; then
  echo ""
  echo "REGRESSION"
  echo "Build: error in $BUILD_ERRORS"
  echo "Tests: skipped (build failed)"

  # Определить виновный коммит
  echo ""
  echo "Recent commits:"
  git log --oneline -10
  exit 1
fi

# ── Integration Tests ────────────────────────────────────────────────
for APP in "${APPS[@]}"; do
  APP=$(echo "$APP" | xargs)
  CONF="vitest.integration.config.ts"

  # Проверить наличие конфига
  if [[ ! -f "apps/$APP/$CONF" ]]; then
    TEST_SUMMARY="${TEST_SUMMARY}@qurvo/$APP: no integration config, skipped\n"
    continue
  fi

  echo ""
  echo "=== Testing @qurvo/$APP ==="
  OUTPUT_FILE="/tmp/post-merge-${APP}.txt"

  if pnpm --filter "@qurvo/$APP" exec vitest run --config "$CONF" 2>&1 | tee "$OUTPUT_FILE"; then
    SUMMARY=$(grep -E "Tests |passed|failed" "$OUTPUT_FILE" 2>/dev/null | tail -3 || echo "passed")
    TEST_SUMMARY="${TEST_SUMMARY}@qurvo/$APP: ${SUMMARY}\n"
  else
    # Retry once for flaky tests
    echo "First run failed, retrying once..."
    if pnpm --filter "@qurvo/$APP" exec vitest run --config "$CONF" 2>&1 | tee "$OUTPUT_FILE"; then
      SUMMARY=$(grep -E "Tests |passed|failed" "$OUTPUT_FILE" 2>/dev/null | tail -3 || echo "passed on retry")
      TEST_SUMMARY="${TEST_SUMMARY}@qurvo/$APP: ${SUMMARY} (flaky, passed on retry)\n"
      FLAKY_TESTS="${FLAKY_TESTS}@qurvo/$APP "
    else
      SUMMARY=$(grep -E "Tests |passed|failed" "$OUTPUT_FILE" 2>/dev/null | tail -3 || echo "failed")
      TEST_SUMMARY="${TEST_SUMMARY}@qurvo/$APP: ${SUMMARY}\n"
      TEST_OK=false
    fi
  fi
done

# ── Результат ────────────────────────────────────────────────────────
echo ""
if [[ "$TEST_OK" == "true" ]]; then
  echo "ALL_GREEN"
  echo "Build: ok"
  printf "Tests: %b" "$TEST_SUMMARY"
  if [[ -n "$FLAKY_TESTS" ]]; then
    echo "Flaky: $FLAKY_TESTS"
  fi
  exit 0
else
  echo "REGRESSION"
  echo "Build: ok"
  printf "Tests: %b" "$TEST_SUMMARY"
  echo ""
  echo "Recent commits (probable cause):"
  git log --oneline -10
  exit 1
fi
