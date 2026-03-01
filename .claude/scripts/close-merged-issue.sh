#!/usr/bin/env bash
# Закрывает смерженный issue: close + comment + снять labels + state MERGED.
# Использование: bash close-merged-issue.sh <NUMBER> <PR_URL> <COMMIT_HASH> <BASE_BRANCH>
set -euo pipefail

NUMBER="${1:?Usage: close-merged-issue.sh <NUMBER> <PR_URL> <COMMIT_HASH> <BASE_BRANCH>}"
PR_URL="${2:?}"
COMMIT_HASH="${3:?}"
BASE_BRANCH="${4:-main}"

# Sanitize inputs to prevent shell expansion in heredoc
PR_URL="${PR_URL//\$/\\\$}"
PR_URL="${PR_URL//\`/\\\`}"
COMMIT_HASH="${COMMIT_HASH//\$/\\\$}"
COMMIT_HASH="${COMMIT_HASH//\`/\\\`}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SM="$SCRIPT_DIR/state-manager.sh"

gh issue edit "$NUMBER" --remove-label "in-progress" --remove-label "under-review" --remove-label "merge-failed" 2>/dev/null || true

CLOSE_OK=false
for attempt in 1 2; do
  if gh issue close "$NUMBER" --comment "$(cat <<COMMENT
## Смерджено

**PR**: $PR_URL
**Коммит**: \`$COMMIT_HASH\`
**Ветка**: \`$BASE_BRANCH\`
COMMENT
)" 2>/dev/null; then
    CLOSE_OK=true
    break
  fi
  [[ $attempt -lt 2 ]] && sleep 2
done

if [[ "$CLOSE_OK" == "true" ]]; then
  # State обновляется ТОЛЬКО после успешного close
  bash "$SM" issue-status "$NUMBER" MERGED "pr_url=$PR_URL" "merge_commit=$COMMIT_HASH"
  echo "CLOSED $NUMBER: PR=$PR_URL COMMIT=$COMMIT_HASH"
else
  echo "CLOSE_FAILED $NUMBER: PR=$PR_URL COMMIT=$COMMIT_HASH" >&2
  exit 1
fi
