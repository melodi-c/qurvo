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

# Check valid JSON first
if ! jq empty "$FILE" 2>/dev/null; then
  echo "ERROR: invalid JSON in $FILE" >&2
  exit 1
fi

# Type-specific schema validation
case "$TYPE" in
  solver)
    # Required: status (READY_FOR_REVIEW|FAILED|NEEDS_USER_INPUT), confidence (high|medium|low)
    VALID=$(jq -e '
      (.status | test("^(READY_FOR_REVIEW|FAILED|NEEDS_USER_INPUT)$")) and
      (.confidence | test("^(high|medium|low)$"))
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: solver result missing/invalid fields (need: status, confidence). File: $FILE" >&2
      jq '{status, confidence}' "$FILE" 2>/dev/null >&2 || true
      exit 1
    } ;;

  reviewer)
    # Required: verdict (APPROVE|REQUEST_CHANGES), issues (array)
    VALID=$(jq -e '
      (.verdict | test("^(APPROVE|REQUEST_CHANGES)$")) and
      (.issues | type == "array")
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: reviewer result missing/invalid fields (need: verdict, issues[]). File: $FILE" >&2
      exit 1
    } ;;

  lint)
    # Required: verdict (PASS|FAIL)
    VALID=$(jq -e '
      .verdict | test("^(PASS|FAIL)$")
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: lint result missing/invalid verdict (need: PASS|FAIL). File: $FILE" >&2
      exit 1
    } ;;

  security)
    # Required: verdict (PASS|FAIL)
    VALID=$(jq -e '
      .verdict | test("^(PASS|FAIL)$")
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: security result missing/invalid verdict. File: $FILE" >&2
      exit 1
    } ;;

  migration)
    # Required: verdict (PASS|FAIL|WARN|SKIP)
    VALID=$(jq -e '
      .verdict | test("^(PASS|FAIL|WARN|SKIP)$")
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: migration result missing/invalid verdict. File: $FILE" >&2
      exit 1
    } ;;

  conflict)
    # Required: status (RESOLVED|UNRESOLVABLE)
    VALID=$(jq -e '
      .status | test("^(RESOLVED|UNRESOLVABLE)$")
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: conflict result missing/invalid status. File: $FILE" >&2
      exit 1
    } ;;

  validator)
    # Required: verdict (READY|BLOCKED|NEEDS_CLARIFICATION)
    VALID=$(jq -e '
      .verdict | test("^(READY|BLOCKED|NEEDS_CLARIFICATION)$")
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: validator result missing/invalid verdict. File: $FILE" >&2
      exit 1
    } ;;

  intersection)
    # Required: parallel_groups (non-empty array of arrays), issues (object)
    VALID=$(jq -e '
      (.parallel_groups | type == "array" and length > 0) and
      (.issues | type == "object" and length > 0)
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: intersection result missing/invalid fields (need: parallel_groups[], issues{}). File: $FILE" >&2
      exit 1
    } ;;

  decomposer)
    # Required: either atomic:true or sub_issues (array)
    VALID=$(jq -e '
      (.atomic == true) or (.sub_issues | type == "array" and length > 0)
    ' "$FILE" 2>/dev/null) || {
      echo "ERROR: decomposer result must have atomic:true or sub_issues[]. File: $FILE" >&2
      exit 1
    } ;;

  *)
    echo "WARN: unknown result type '$TYPE', skipping validation" >&2
    exit 0 ;;
esac

echo "OK"
