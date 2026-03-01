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

# Stale worktree detection: предупреждаем об orphaned worktrees
WORKTREES_BASE="$HOME/worktrees"
if [[ -d "$WORKTREES_BASE" ]]; then
  STALE_COUNT=0
  for _wt_dir in "$WORKTREES_BASE"/*/; do
    [[ -d "$_wt_dir" ]] || continue
    _wt_name=$(basename "$_wt_dir")
    case "$_wt_name" in agent-*|fix-*|feature-*) ;; *) continue ;; esac
    _wt_age=$(( $(date +%s) - $(stat -f %m "$_wt_dir" 2>/dev/null || echo "0") ))
    if [[ "$_wt_age" -gt 7200 ]]; then
      echo "WARN: stale worktree detected: $_wt_dir (age: $((_wt_age / 60))min)" >&2
      STALE_COUNT=$((STALE_COUNT + 1))
    fi
  done
  if [[ "$STALE_COUNT" -gt 0 ]]; then
    echo "WARN: $STALE_COUNT stale worktree(s) found. Consider running cleanup-worktrees.sh" >&2
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
  local _RESULT
  # gh api при 404 выводит JSON-ошибку в stdout ПЕРЕД exit, поэтому
  # || echo "[]" склеивает stdout ошибки с "[]" → невалидный JSON.
  # Решение: захватить stdout, проверить exit code, валидировать JSON.
  _RESULT=$(gh api "repos/$REPO/issues/$NUMBER/sub_issues" \
    --jq '[.[] | {number, title, state}]' 2>/dev/null) || _RESULT="[]"
  # Проверить что результат — валидный JSON-массив
  if ! echo "$_RESULT" | jq -e 'type == "array"' >/dev/null 2>&1; then
    _RESULT="[]"
  fi
  echo "$_RESULT"
}

_CACHED_SUB_ISSUES=""

# Sets _CACHED_SUB_ISSUES and _CACHED_TOPOLOGY as side effects.
# Must NOT be called inside $() — subshell won't propagate globals.
determine_topology() {
  local NUMBER="$1"
  _CACHED_SUB_ISSUES=$(fetch_sub_issues "$NUMBER")
  local COUNT
  COUNT=$(echo "$_CACHED_SUB_ISSUES" | jq 'length')

  if [ "$COUNT" -gt 0 ]; then
    _CACHED_TOPOLOGY="parent"
  else
    _CACHED_TOPOLOGY="standalone"
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
  # Предупреждение если результат может быть обрезан
  _FETCHED_COUNT=$(echo "$ISSUES_JSON" | jq 'length')
  if [[ "$_FETCHED_COUNT" -ge 50 ]]; then
    echo "WARN: fetched exactly 50 issues — there may be more matching the filter (limit=50)" >&2
  fi
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

  # Determine topology (called directly, not in subshell, to preserve _CACHED_*)
  determine_topology "$NUMBER"
  TOPOLOGY="$_CACHED_TOPOLOGY"
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
