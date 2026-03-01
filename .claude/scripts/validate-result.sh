#!/usr/bin/env bash
# Validates agent result JSON files against expected schemas.
# Usage: bash validate-result.sh <type> <file_path>
# Types: solver, reviewer, lint, security, migration, conflict, validator, intersection, decomposer
# Exit codes: 0 = valid, 1 = invalid/missing, 2 = file not found
set -euo pipefail

TYPE="${1:?Usage: validate-result.sh <type> <file_path>}"
FILE="${2:?}"

if [[ ! -f "$FILE" ]]; then
  echo "ERROR: result file not found: $FILE" >&2
  exit 2
fi

if ! jq empty "$FILE" 2>/dev/null; then
  echo "ERROR: invalid JSON in $FILE" >&2
  exit 1
fi

# Helper: validate a single field matches a regex pattern
check_field() {
  local field="$1" pattern="$2"
  jq -e ".$field | test(\"$pattern\")" "$FILE" >/dev/null 2>&1 || {
    echo "ERROR: $TYPE result: invalid/missing '$field' (expected: $pattern) in $FILE" >&2
    exit 1
  }
}

case "$TYPE" in
  solver)
    check_field "status" "^(READY_FOR_REVIEW|FAILED|NEEDS_USER_INPUT|RUNNING)$"
    STATUS=$(jq -r '.status' "$FILE")
    if [[ "$STATUS" == "RUNNING" ]]; then
      # Phase optional for backward compat (bare RUNNING still valid)
      PHASE=$(jq -r '.phase // empty' "$FILE")
      if [[ -n "$PHASE" ]]; then
        KNOWN="INIT|ANALYZING|PLANNING|IMPLEMENTING|TESTING|BUILDING|LINTING|FINALIZING"
        if ! echo "$PHASE" | grep -qE "^($KNOWN)$"; then
          echo "WARN: unknown solver phase '$PHASE' in $FILE" >&2
        fi
      fi
    else
      check_field "confidence" "^(high|medium|low)$"
    fi ;;
  reviewer)
    check_field "verdict" "^(APPROVE|REQUEST_CHANGES)$"
    jq -e '.issues | type == "array"' "$FILE" >/dev/null 2>&1 || {
      echo "ERROR: reviewer result: missing 'issues' array in $FILE" >&2; exit 1
    } ;;
  lint|security)       check_field "verdict" "^(PASS|FAIL)$" ;;
  migration)           check_field "verdict" "^(PASS|FAIL|WARN|SKIP)$" ;;
  conflict)            check_field "status"  "^(RESOLVED|UNRESOLVABLE)$" ;;
  validator)           check_field "verdict" "^(READY|BLOCKED|NEEDS_CLARIFICATION)$" ;;
  intersection)
    jq -e '(.parallel_groups | type == "array" and length > 0) and (.issues | type == "object" and length > 0)' "$FILE" >/dev/null 2>&1 || {
      echo "ERROR: intersection result: need non-empty parallel_groups[] and issues{} in $FILE" >&2; exit 1
    } ;;
  decomposer)
    jq -e '(.atomic == true) or (.sub_issues | type == "array" and length > 0)' "$FILE" >/dev/null 2>&1 || {
      echo "ERROR: decomposer result: need atomic:true or sub_issues[] in $FILE" >&2; exit 1
    } ;;
  *)
    echo "WARN: unknown result type '$TYPE', skipping validation" >&2
    exit 0 ;;
esac

echo "OK"
