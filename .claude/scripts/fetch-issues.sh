#!/usr/bin/env bash
# Получает issues, сохраняет тела в файлы, инициализирует state.
# Использование:
#   bash fetch-issues.sh --label ready
#   bash fetch-issues.sh --numbers 42,43,44
#   bash fetch-issues.sh --label ready --label api
#   bash fetch-issues.sh --numbers 698,699 --data-only   # only write issue-N.json, skip state init
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SM="$SCRIPT_DIR/state-manager.sh"
RESULTS_DIR="/tmp/claude-results"
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/state"
STATE_FILE="$STATE_DIR/execution-state.json"
REPO=""

# Guard against concurrent executors
if [[ -f "$STATE_FILE" ]]; then
  EXISTING_PHASE=$(jq -r '.phase // "UNKNOWN"' "$STATE_FILE" 2>/dev/null)
  if [[ "$EXISTING_PHASE" != "COMPLETED" && "$EXISTING_PHASE" != "UNKNOWN" ]]; then
    echo "ERROR: Another executor is running (phase=$EXISTING_PHASE). State file exists at $STATE_FILE" >&2
    echo "To force restart, delete the state file: rm $STATE_FILE" >&2
    exit 1
  fi
fi

# --- helpers ---
get_repo() {
  [ -n "$REPO" ] && return
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
}

fetch_sub_issues() {
  local NUMBER="$1"
  get_repo
  gh api "repos/$REPO/issues/$NUMBER/sub_issues" \
    --jq '[.[] | {number, title, state}]' 2>/dev/null || echo "[]"
}

_CACHED_SUB_ISSUES=""

determine_topology() {
  local NUMBER="$1"
  _CACHED_SUB_ISSUES=$(fetch_sub_issues "$NUMBER")
  local COUNT
  COUNT=$(echo "$_CACHED_SUB_ISSUES" | jq 'length')

  if [ "$COUNT" -gt 0 ]; then
    echo "parent"
  else
    echo "standalone"
  fi
}

write_issue_file() {
  local JSON="$1"
  local NUMBER
  NUMBER=$(echo "$JSON" | jq -r '.number')
  echo "$JSON" > "$RESULTS_DIR/issue-${NUMBER}.json"
}

extract_labels_csv() {
  local JSON="$1"
  echo "$JSON" | jq -r '[.labels[]?.name // empty] | join(",")' 2>/dev/null || echo ""
}

# --- parse args ---
MODE=""
NUMBERS=""
DATA_ONLY=false
GH_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --data-only)
      DATA_ONLY=true
      shift ;;
    --numbers)
      MODE="numbers"
      NUMBERS="$2"
      shift 2 ;;
    --label|--state|--limit|--assignee|--milestone)
      GH_ARGS+=("$1" "$2")
      shift 2 ;;
    *)
      GH_ARGS+=("$1")
      shift ;;
  esac
done

# --- init ---
if [ "$DATA_ONLY" = false ]; then
  rm -rf "$RESULTS_DIR" && mkdir -p "$RESULTS_DIR"
  bash "$SM" init "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
  mkdir -p "$RESULTS_DIR"
fi

# --- fetch issues ---
ISSUES_JSON="[]"

if [ "$MODE" = "numbers" ]; then
  # Fetch each issue individually, build JSON array safely with jq
  ISSUES_TMP=$(mktemp)
  trap 'rm -f "$ISSUES_TMP"' EXIT
  IFS=',' read -ra NUMS <<< "$NUMBERS"
  for N in "${NUMS[@]}"; do
    N=$(echo "$N" | tr -d ' ')
    ISSUE=$(gh issue view "$N" --json number,title,body,labels,comments 2>/dev/null) || continue
    echo "$ISSUE" >> "$ISSUES_TMP"
  done
  ISSUES_JSON=$(jq -s '.' "$ISSUES_TMP")
  rm -f "$ISSUES_TMP"
  trap - EXIT
else
  # Default: list with filters
  if [ ${#GH_ARGS[@]} -eq 0 ]; then
    GH_ARGS=(--state open)
  fi
  ISSUES_JSON=$(gh issue list "${GH_ARGS[@]}" --json number,title,body,labels,comments --limit 50)
fi

# --- filter skip label ---
ISSUES_JSON=$(echo "$ISSUES_JSON" | jq '[.[] | select([.labels[]?.name // empty] | index("skip") | not)]')

COUNT=$(echo "$ISSUES_JSON" | jq 'length')

if [ "$COUNT" -eq 0 ]; then
  echo "ISSUES_COUNT=0"
  exit 0
fi

# --- process each issue ---
MANIFEST="[]"
GROUP=0

for i in $(seq 0 $((COUNT - 1))); do
  ISSUE=$(echo "$ISSUES_JSON" | jq ".[$i]")
  NUMBER=$(echo "$ISSUE" | jq -r '.number')
  TITLE=$(echo "$ISSUE" | jq -r '.title')
  LABELS_CSV=$(extract_labels_csv "$ISSUE")

  # Determine topology
  TOPOLOGY=$(determine_topology "$NUMBER")
  SUB_ISSUES_JSON="$_CACHED_SUB_ISSUES"

  # Check if this issue is a sub-issue of another (heuristic: check body for "parent" or task list ref)
  # For now we rely on the sub_issues API from the parent side

  # Write issue data file
  echo "$ISSUE" | jq --arg topology "$TOPOLOGY" --argjson sub_issues "$SUB_ISSUES_JSON" \
    '. + {topology: $topology, sub_issues: $sub_issues}' > "$RESULTS_DIR/issue-${NUMBER}.json"

  # Add to state (skip in data-only mode)
  if [ "$DATA_ONLY" = false ]; then
    bash "$SM" issue-add "$NUMBER" "$TITLE" "$GROUP"
  fi

  # Build manifest entry
  MANIFEST=$(echo "$MANIFEST" | jq --argjson n "$NUMBER" --arg t "$TITLE" \
    --arg top "$TOPOLOGY" --arg l "$LABELS_CSV" \
    '. + [{number: $n, title: $t, topology: $top, labels: $l}]')

  # Output compact line
  COMMENTS_COUNT=$(echo "$ISSUE" | jq '(.comments // []) | length')
  printf '%s\t%s\t%s\t%s\t%s\n' "$NUMBER" "$TITLE" "$TOPOLOGY" "$LABELS_CSV" "$COMMENTS_COUNT"
done

# --- write manifest ---
echo "$MANIFEST" > "$RESULTS_DIR/issues-manifest.json"

# --- summary ---
echo "ISSUES_COUNT=$COUNT"
echo "MANIFEST: $RESULTS_DIR/issues-manifest.json"
