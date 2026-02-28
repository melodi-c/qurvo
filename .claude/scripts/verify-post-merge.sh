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

IFS=',' read -ra APPS <<< "$AFFECTED_APPS"

BUILD_OK=true
BUILD_ERRORS=""
TEST_SUMMARY=""
TEST_OK=true
FLAKY_TESTS=""

# ── Build (вывод в лог-файлы) ────────────────────────────────────────
for APP in "${APPS[@]}"; do
  APP=$(echo "$APP" | xargs)  # trim whitespace
  BUILD_LOG="/tmp/post-merge-build-${APP}.log"
  if pnpm turbo build --filter="@qurvo/$APP" > "$BUILD_LOG" 2>&1; then
    :
  else
    BUILD_OK=false
    BUILD_ERRORS="${BUILD_ERRORS}@qurvo/$APP "
  fi
done

if [[ "$BUILD_OK" == "false" ]]; then
  echo "REGRESSION"
  echo "Build: error in $BUILD_ERRORS"
  echo "Tests: skipped (build failed)"
  exit 1
fi

# ── Integration Tests (вывод в лог-файлы) ────────────────────────────
for APP in "${APPS[@]}"; do
  APP=$(echo "$APP" | xargs)
  CONF="vitest.integration.config.ts"

  # Проверить наличие конфига
  if [[ ! -f "apps/$APP/$CONF" ]]; then
    TEST_SUMMARY="${TEST_SUMMARY}@qurvo/$APP: skipped\n"
    continue
  fi

  OUTPUT_FILE="/tmp/post-merge-test-${APP}.log"

  if pnpm --filter "@qurvo/$APP" exec vitest run --config "$CONF" > "$OUTPUT_FILE" 2>&1; then
    SUMMARY=$(grep -E "Tests |passed|failed" "$OUTPUT_FILE" 2>/dev/null | tail -3 || echo "passed")
    TEST_SUMMARY="${TEST_SUMMARY}@qurvo/$APP: ${SUMMARY}\n"
  else
    # Retry once for flaky tests
    if pnpm --filter "@qurvo/$APP" exec vitest run --config "$CONF" > "$OUTPUT_FILE" 2>&1; then
      SUMMARY=$(grep -E "Tests |passed|failed" "$OUTPUT_FILE" 2>/dev/null | tail -3 || echo "passed on retry")
      TEST_SUMMARY="${TEST_SUMMARY}@qurvo/$APP: ${SUMMARY} (flaky)\n"
      FLAKY_TESTS="${FLAKY_TESTS}@qurvo/$APP "
    else
      SUMMARY=$(grep -E "Tests |passed|failed" "$OUTPUT_FILE" 2>/dev/null | tail -3 || echo "failed")
      TEST_SUMMARY="${TEST_SUMMARY}@qurvo/$APP: ${SUMMARY}\n"
      TEST_OK=false
    fi
  fi
done

# ── Результат (только ключевые строки в stdout) ──────────────────────
if [[ "$TEST_OK" == "true" ]]; then
  echo "ALL_GREEN"
  printf "Tests: %b" "$TEST_SUMMARY"
  if [[ -n "$FLAKY_TESTS" ]]; then
    echo "Flaky: $FLAKY_TESTS"
  fi
  exit 0
else
  echo "REGRESSION"
  printf "Tests: %b" "$TEST_SUMMARY"
  exit 1
fi
