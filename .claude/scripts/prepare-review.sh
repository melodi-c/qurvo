#!/usr/bin/env bash
# Подготовка к review: state updates + label.
# Использование: bash prepare-review.sh <NUMBER>
set -euo pipefail

NUMBER="${1:?Usage: prepare-review.sh <NUMBER>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SM="$SCRIPT_DIR/state-manager.sh"

bash "$SM" issue-status "$NUMBER" READY_FOR_REVIEW

gh issue edit "$NUMBER" --add-label "under-review" 2>/dev/null || true

echo "REVIEW $NUMBER: ready"
