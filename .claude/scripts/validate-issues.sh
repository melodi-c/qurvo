#!/usr/bin/env bash
# Валидация GitHub issues — замена issue-validator агента.
# Использование: bash validate-issues.sh [номера issues | --label <label> | --all-without-ready]
# Вывод: таблица результатов + навешивание лейблов ready / needs-clarification.
set -euo pipefail

# ── Парсинг аргументов ──────────────────────────────────────────────
MODE=""
LABEL=""
ISSUE_NUMBERS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; MODE="label"; shift 2 ;;
    --all-without-ready) MODE="all"; shift ;;
    *) ISSUE_NUMBERS+=("$1"); MODE="numbers"; shift ;;
  esac
done

if [[ -z "$MODE" ]]; then
  echo "Usage: validate-issues.sh [<number>...] [--label <label>] [--all-without-ready]" >&2
  exit 1
fi

# ── Получить issues ─────────────────────────────────────────────────
fetch_issues() {
  case "$MODE" in
    numbers)
      for n in "${ISSUE_NUMBERS[@]}"; do
        gh issue view "$n" --json number,title,body,labels,state 2>/dev/null || true
      done | jq -s '.'
      ;;
    label)
      gh issue list --state open --label "$LABEL" --json number,title,body,labels --limit 100
      ;;
    all)
      gh issue list --state open --json number,title,body,labels --limit 100
      ;;
  esac
}

ISSUES_JSON=$(fetch_issues)
TOTAL=$(echo "$ISSUES_JSON" | jq 'length')

if [[ "$TOTAL" -eq 0 ]]; then
  echo "Нет issues для валидации."
  exit 0
fi

# ── Обеспечить лейблы ───────────────────────────────────────────────
gh label create "ready" --description "Ready to be worked on" --color "0E8A16" 2>/dev/null || true
gh label create "needs-clarification" --description "Needs clarification before work can begin" --color "FBCA04" 2>/dev/null || true

# ── Валидация ────────────────────────────────────────────────────────
READY_COUNT=0
NEEDS_COUNT=0
SKIPPED_COUNT=0

echo ""
echo "## Результаты валидации"
echo ""
echo "| # | Issue | Описание | Criteria | Зависимости | Итог |"
echo "|---|-------|----------|----------|-------------|------|"

for i in $(seq 0 $((TOTAL - 1))); do
  NUMBER=$(echo "$ISSUES_JSON" | jq -r ".[$i].number")
  TITLE=$(echo "$ISSUES_JSON" | jq -r ".[$i].title")
  BODY=$(echo "$ISSUES_JSON" | jq -r ".[$i].body // \"\"")
  LABELS=$(echo "$ISSUES_JSON" | jq -r ".[$i].labels[].name" 2>/dev/null || echo "")

  # Пропустить уже ready
  if echo "$LABELS" | grep -qx "ready"; then
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  # Пропустить in-progress
  if echo "$LABELS" | grep -qx "in-progress"; then
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  FAILURES=()

  # Проверка 1: Описание > 100 символов
  BODY_LEN=${#BODY}
  if [[ $BODY_LEN -gt 100 ]]; then
    CHECK1="✅"
  else
    CHECK1="❌"
    FAILURES+=("Описание слишком короткое ($BODY_LEN символов, нужно >100)")
  fi

  # Проверка 2: Acceptance Criteria
  if echo "$BODY" | grep -qiE '(acceptance criteria|criteria|критерии|требования|expected|definition of done|dod|- \[ \])'; then
    CHECK2="✅"
  else
    CHECK2="❌"
    FAILURES+=("Нет секции Acceptance Criteria или чеклиста")
  fi

  # Проверка 3: Зависимости закрыты
  CHECK3="✅"
  DEPS=$(echo "$BODY" | grep -oP '(?i)depends on:?\s*#\K\d+' || true)
  if [[ -n "$DEPS" ]]; then
    for DEP in $DEPS; do
      DEP_STATE=$(gh issue view "$DEP" --json state -q .state 2>/dev/null || echo "UNKNOWN")
      if [[ "$DEP_STATE" != "CLOSED" ]]; then
        CHECK3="⏳ #$DEP $DEP_STATE"
        FAILURES+=("Зависимость #$DEP ещё не закрыта ($DEP_STATE)")
      fi
    done
    [[ "$CHECK3" == "✅" ]] && CHECK3="✅ (закрыты)"
  else
    CHECK3="✅ (нет)"
  fi

  # Проверка 4: Заголовок (warn, не блокирует)
  TITLE_LEN=${#TITLE}
  TITLE_WARN=""
  if [[ $TITLE_LEN -lt 20 ]]; then
    TITLE_WARN=" ⚠️ короткий title"
  fi

  # Итог
  if [[ ${#FAILURES[@]} -eq 0 ]]; then
    RESULT="✅ ready"
    READY_COUNT=$((READY_COUNT + 1))
    gh issue edit "$NUMBER" --add-label "ready" 2>/dev/null || true
    # Снять needs-clarification если был
    if echo "$LABELS" | grep -qx "needs-clarification"; then
      gh issue edit "$NUMBER" --remove-label "needs-clarification" 2>/dev/null || true
      gh issue comment "$NUMBER" --body "✅ Issue прошёл валидацию и помечен как \`ready\`." 2>/dev/null || true
    fi
  else
    RESULT="❌ needs-clarification"
    NEEDS_COUNT=$((NEEDS_COUNT + 1))
    gh issue edit "$NUMBER" --add-label "needs-clarification" 2>/dev/null || true
    # Комментарий с деталями
    FAIL_LIST=""
    for f in "${FAILURES[@]}"; do
      FAIL_LIST="${FAIL_LIST}\n- [ ] $f"
    done
    gh issue comment "$NUMBER" --body "$(printf '⚠️ **Issue требует уточнения перед выполнением**\n\nСледующие проверки не прошли:\n%b\n\nПожалуйста, обнови описание issue и запусти валидацию повторно.' "$FAIL_LIST")" 2>/dev/null || true
  fi

  echo "| $((i+1)) | #$NUMBER \"$TITLE\"$TITLE_WARN | $CHECK1 | $CHECK2 | $CHECK3 | $RESULT |"
done

echo ""
echo "Ready: $READY_COUNT | Needs clarification: $NEEDS_COUNT | Пропущено (ready/in-progress): $SKIPPED_COUNT"
