#!/usr/bin/env bash
# Начинает выполнение группы: ставит in-progress label + обновляет state.
# Использование: bash start-group.sh <GROUP_INDEX> <ISSUE_NUMBERS_CSV>
set -euo pipefail

GROUP_INDEX="${1:?Usage: start-group.sh <GROUP_INDEX> <ISSUE_NUMBERS_CSV>}"
ISSUES_CSV="${2:?Usage: start-group.sh <GROUP_INDEX> <ISSUE_NUMBERS_CSV>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SM="$SCRIPT_DIR/state-manager.sh"

IFS=',' read -ra NUMS <<< "$ISSUES_CSV"

for N in "${NUMS[@]}"; do
  N=$(echo "$N" | tr -d ' ')
  gh issue edit "$N" --add-label "in-progress" 2>/dev/null || true
done

bash "$SM" batch \
  "phase EXECUTING_GROUP" \
  "group-index $GROUP_INDEX"

echo "GROUP $GROUP_INDEX: in-progress set for $ISSUES_CSV"
