#!/usr/bin/env bash
# Получает issues, сохраняет тела в файлы, инициализирует state.
# Использование:
#   bash fetch-issues.sh --label ready
#   bash fetch-issues.sh --numbers 42,43,44
#   bash fetch-issues.sh --label ready --label api
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SM="$SCRIPT_DIR/state-manager.sh"
RESULTS_DIR="/tmp/claude-results"
REPO=""

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

determine_topology() {
  local NUMBER="$1"
  local SUB_ISSUES
  SUB_ISSUES=$(fetch_sub_issues "$NUMBER")
  local COUNT
  COUNT=$(echo "$SUB_ISSUES" | jq 'length')

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

# --- init ---
rm -rf "$RESULTS_DIR" && mkdir -p "$RESULTS_DIR"
bash "$SM" init "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- parse args ---
MODE=""
NUMBERS=""
GH_ARGS=()

while [ $# -gt 0 ]; do
  case "$1" in
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

# --- fetch issues ---
ISSUES_JSON="[]"

if [ "$MODE" = "numbers" ]; then
  # Fetch each issue individually
  ISSUES_JSON="["
  FIRST=true
  IFS=',' read -ra NUMS <<< "$NUMBERS"
  for N in "${NUMS[@]}"; do
    N=$(echo "$N" | tr -d ' ')
    ISSUE=$(gh issue view "$N" --json number,title,body,labels,comments 2>/dev/null) || continue
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      ISSUES_JSON+=","
    fi
    ISSUES_JSON+="$ISSUE"
  done
  ISSUES_JSON+="]"
else
  # Default: list with filters
  if [ ${#GH_ARGS[@]} -eq 0 ]; then
    GH_ARGS=(--state open)
  fi
  ISSUES_JSON=$(gh issue list "${GH_ARGS[@]}" --json number,title,body,labels --limit 50)
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
  SUB_ISSUES_JSON="[]"
  if [ "$TOPOLOGY" = "parent" ]; then
    SUB_ISSUES_JSON=$(fetch_sub_issues "$NUMBER")
  fi

  # Check if this issue is a sub-issue of another (heuristic: check body for "parent" or task list ref)
  # For now we rely on the sub_issues API from the parent side

  # Write issue data file
  echo "$ISSUE" | jq --arg topology "$TOPOLOGY" --argjson sub_issues "$SUB_ISSUES_JSON" \
    '. + {topology: $topology, sub_issues: $sub_issues}' > "$RESULTS_DIR/issue-${NUMBER}.json"

  # Add to state
  bash "$SM" issue-add "$NUMBER" "$TITLE" "$GROUP"

  # Build manifest entry
  MANIFEST=$(echo "$MANIFEST" | jq --argjson n "$NUMBER" --arg t "$TITLE" \
    --arg top "$TOPOLOGY" --arg l "$LABELS_CSV" \
    '. + [{number: $n, title: $t, topology: $top, labels: $l}]')

  # Output compact line
  COMMENTS_COUNT=$(echo "$ISSUE" | jq '[.comments // [] | length] | .[0] // 0')
  echo "${NUMBER}|${TITLE}|${TOPOLOGY}|${LABELS_CSV}|${COMMENTS_COUNT}"
done

# --- write manifest ---
echo "$MANIFEST" > "$RESULTS_DIR/issues-manifest.json"

# --- summary ---
echo "ISSUES_COUNT=$COUNT"
echo "MANIFEST: $RESULTS_DIR/issues-manifest.json"
