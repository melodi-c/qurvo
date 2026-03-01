#!/usr/bin/env bash
# Закрывает смерженный issue: state MERGED + снять labels + close + comment.
# Использование: bash close-merged-issue.sh <NUMBER> <PR_URL> <COMMIT_HASH> <BASE_BRANCH>
set -euo pipefail

NUMBER="${1:?Usage: close-merged-issue.sh <NUMBER> <PR_URL> <COMMIT_HASH> <BASE_BRANCH>}"
PR_URL="${2:?}"
COMMIT_HASH="${3:?}"
BASE_BRANCH="${4:-main}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SM="$SCRIPT_DIR/state-manager.sh"

bash "$SM" issue-status "$NUMBER" MERGED "pr_url=$PR_URL" "merge_commit=$COMMIT_HASH"

gh issue edit "$NUMBER" --remove-label "in-progress" --remove-label "under-review" 2>/dev/null || true

if gh issue close "$NUMBER" --comment "$(cat <<COMMENT
## Смерджено

**PR**: $PR_URL
**Коммит**: \`$COMMIT_HASH\`
**Ветка**: \`$BASE_BRANCH\`
COMMENT
)" 2>/dev/null; then
  echo "CLOSED $NUMBER: PR=$PR_URL COMMIT=$COMMIT_HASH"
else
  echo "WARN: gh issue close failed for #$NUMBER" >&2
  echo "CLOSE_FAILED $NUMBER: PR=$PR_URL COMMIT=$COMMIT_HASH"
fi
