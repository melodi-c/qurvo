#!/usr/bin/env bash
# Одноразовое создание всех лейблов для issue workflow.
# Использование: bash setup-labels.sh
# Идемпотентный — безопасно запускать повторно.
set -euo pipefail

labels=(
  "in-progress|Currently being worked on|0052CC"
  "blocked|Blocked, needs attention|B60205"
  "ready|Ready to be worked on|0E8A16"
  "needs-clarification|Needs clarification before work can begin|FBCA04"
  "skip|Intentionally skipped by user|CCCCCC"
  "has-migrations|Requires DB or ClickHouse migrations|C5DEF5"
  "size:xs|Extra small: <30 min|F9D0C4"
  "size:s|Small: <2 hours|F9D0C4"
  "size:m|Medium: <1 day|E4E669"
  "size:l|Large: >1 day|D93F0B"
  "bug|Something isn't working|D73A4A"
  "enhancement|New feature or request|A2EEEF"
  "refactor|Code refactoring|D4C5F9"
  "epic|Epic with sub-issues|3E4B9E"
  "web|Frontend (apps/web)|1D76DB"
  "api|Backend (apps/api)|0075CA"
  "security|Security related|E11D48"
  "billing|Billing related|F9A825"
  "ai|AI/ML related|7057FF"
  "i18n|Internationalization|BFDADC"
  "ux/ui|User experience / interface|D876E3"
  "architecture|Architecture related|006B75"
  "good first issue|Good for newcomers|7057FF"
  "regression|Reverted due to post-merge regression|B60205"
  "under-review|Under automated review|0052CC"
  "needs-review|Requires human review before merge|FBCA04"
  "merge-failed|Merge failed, needs manual intervention|B60205"
)

CREATED=0
EXISTED=0

for entry in "${labels[@]}"; do
  IFS='|' read -r NAME DESC COLOR <<< "$entry"
  if gh label create "$NAME" --description "$DESC" --color "$COLOR" 2>/dev/null; then
    CREATED=$((CREATED + 1))
  else
    EXISTED=$((EXISTED + 1))
  fi
done

echo "Labels: $CREATED created, $EXISTED already existed."
