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

# --- parse args (early, before lock guard needs DATA_ONLY) ---
MODE=""
NUMBERS=""
DATA_ONLY=false
GH_ARGS=()

_ARGS_COPY=("$@")
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

# Helper: age of a file/dir in seconds (macOS-compatible)
_age_s() { echo $(( $(date +%s) - $(stat -f %m "$1" 2>/dev/null || echo "0") )); }

# Guard against concurrent executors (atomic mkdir-based lock)
EXECUTOR_LOCK="${STATE_DIR}/executor.lock.d"
_executor_lock_acquired=false
if [[ "$DATA_ONLY" != "true" ]]; then
  for _try in $(seq 1 5); do
    if mkdir "$EXECUTOR_LOCK" 2>/dev/null; then
      _executor_lock_acquired=true
      trap 'rmdir "$EXECUTOR_LOCK" 2>/dev/null || true' EXIT
      break
    fi
    # Staleness check: if lock is older than 10 minutes, force-break
    if [[ -d "$EXECUTOR_LOCK" ]] && [[ $(_age_s "$EXECUTOR_LOCK") -gt 600 ]]; then
      echo "WARN: stale executor lock ($(_age_s "$EXECUTOR_LOCK")s old), force-breaking" >&2
      rmdir "$EXECUTOR_LOCK" 2>/dev/null || rm -rf "$EXECUTOR_LOCK" 2>/dev/null || true
      continue
    fi
    sleep 1
  done
  if ! $_executor_lock_acquired; then
    echo "ERROR: Cannot acquire executor lock. Another executor may be running." >&2
    echo "To force restart: rmdir $EXECUTOR_LOCK && rm -f $STATE_FILE" >&2
    exit 1
  fi
fi

# Check existing state (after acquiring lock — now race-free)
# DATA_ONLY mode skips state check — it only writes issue-N.json files
if [[ "$DATA_ONLY" != "true" && -f "$STATE_FILE" ]]; then
  EXISTING_PHASE=$(jq -r '.phase // "UNKNOWN"' "$STATE_FILE" 2>/dev/null)
  if [[ "$EXISTING_PHASE" != "COMPLETED" && "$EXISTING_PHASE" != "UNKNOWN" ]]; then
    echo "ERROR: Previous execution not completed (phase=$EXISTING_PHASE). State file exists at $STATE_FILE" >&2
    echo "To force restart, delete the state file: rm $STATE_FILE" >&2
    rmdir "$EXECUTOR_LOCK" 2>/dev/null || true
    exit 1
  fi
fi

# Cleanup stale worktree-base-branch file (persists on crash — causes wrong base for next run)
_BASE_BRANCH_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/state/worktree-base-branch"
if [[ -f "$_BASE_BRANCH_FILE" ]] && [[ $(_age_s "$_BASE_BRANCH_FILE") -gt 300 ]]; then
  echo "WARN: stale worktree-base-branch ($(_age_s "$_BASE_BRANCH_FILE")s old), removing" >&2
  rm -f "$_BASE_BRANCH_FILE"
fi

# Stale worktree detection
STALE_COUNT=0
for _wt_dir in "$HOME/worktrees"/*/; do
  [[ -d "$_wt_dir" ]] || continue
  case "$(basename "$_wt_dir")" in agent-*|fix-*|feature-*) ;; *) continue ;; esac
  if [[ $(_age_s "$_wt_dir") -gt 7200 ]]; then
    echo "WARN: stale worktree: $_wt_dir ($(( $(_age_s "$_wt_dir") / 60 ))min)" >&2
    STALE_COUNT=$((STALE_COUNT + 1))
  fi
done
[[ "$STALE_COUNT" -eq 0 ]] || echo "WARN: $STALE_COUNT stale worktree(s). Run cleanup-worktrees.sh" >&2

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

extract_labels_csv() {
  local JSON="$1"
  echo "$JSON" | jq -r '[.labels[]?.name // empty] | join(",")' 2>/dev/null || echo ""
}

# (args already parsed above, before lock guard)

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
  IFS=',' read -ra NUMS <<< "$NUMBERS"
  for N in "${NUMS[@]}"; do
    N=$(echo "$N" | tr -d ' ')
    ISSUE=$(gh issue view "$N" --json number,title,body,labels,comments 2>/dev/null) || continue
    echo "$ISSUE" >> "$ISSUES_TMP"
  done
  ISSUES_JSON=$(jq -s '.' "$ISSUES_TMP")
  rm -f "$ISSUES_TMP"
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

  # Write issue data file
  echo "$ISSUE" | jq --arg topology "$TOPOLOGY" --argjson sub_issues "$SUB_ISSUES_JSON" \
    '. + {topology: $topology, sub_issues: $sub_issues}' > "$RESULTS_DIR/issue-${NUMBER}.json"

  # Add to state (skip in data-only mode)
  if [ "$DATA_ONLY" = false ]; then
    bash "$SM" issue-add "$NUMBER" "$TITLE" "$GROUP"
  fi

  # Output compact line
  COMMENTS_COUNT=$(echo "$ISSUE" | jq '(.comments // []) | length')
  printf '%s\t%s\t%s\t%s\t%s\n' "$NUMBER" "$TITLE" "$TOPOLOGY" "$LABELS_CSV" "$COMMENTS_COUNT"
done

# --- write manifest (single jq pass over written files, not O(n²) append) ---
jq -s '[.[] | {number, title, topology, labels: ([.labels[]?.name // empty] | join(","))}]' \
  "$RESULTS_DIR"/issue-*.json > "$RESULTS_DIR/issues-manifest.json"

# --- summary ---
echo "ISSUES_COUNT=$COUNT"
echo "MANIFEST: $RESULTS_DIR/issues-manifest.json"
