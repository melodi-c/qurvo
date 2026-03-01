#!/usr/bin/env bash
# Начинает выполнение группы: ставит in-progress label + обновляет state.
# Использование: bash start-group.sh <GROUP_INDEX> <ISSUE_NUMBERS_CSV>
set -euo pipefail

GROUP_INDEX="${1:?Usage: start-group.sh <GROUP_INDEX> <ISSUE_NUMBERS_CSV>}"
ISSUES_CSV="${2:?Usage: start-group.sh <GROUP_INDEX> <ISSUE_NUMBERS_CSV>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SM="$SCRIPT_DIR/state-manager.sh"

_LABELED_ISSUES=()
cleanup_labels() {
  for n in "${_LABELED_ISSUES[@]}"; do
    gh issue edit "$n" --remove-label "in-progress" 2>/dev/null || true
  done
}

IFS=',' read -ra NUMS <<< "$ISSUES_CSV"

# Фаза 1: Label issues (ERR trap только на этом этапе)
trap cleanup_labels ERR
for N in "${NUMS[@]}"; do
  N=$(echo "$N" | tr -d ' ')
  # Validate issue number is numeric
  if [[ ! "$N" =~ ^[0-9]+$ ]]; then
    echo "WARN: skipping invalid issue number: $N" >&2
    continue
  fi
  gh issue edit "$N" --add-label "in-progress" 2>/dev/null || true
  _LABELED_ISSUES+=("$N")
done
# Снимаем ERR trap перед state write — если state упадёт,
# labels остаются (executor разберётся при recovery)
trap - ERR

# Фаза 2: Update state (labels уже поставлены, откат не нужен)
bash "$SM" batch \
  "phase EXECUTING_GROUP" \
  "group-index $GROUP_INDEX"

echo "GROUP $GROUP_INDEX: in-progress set for $ISSUES_CSV"
