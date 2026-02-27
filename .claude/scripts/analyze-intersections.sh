#!/usr/bin/env bash
# Детерминированный анализ пересечений issues для параллелизации.
# Использование: echo '<issues_json>' | bash analyze-intersections.sh
# Вход (stdin): JSON массив issues с полями: number, title, body, labels[].name
# Выход (stdout): JSON с affected apps и parallel_groups.
set -euo pipefail

ISSUES_JSON=$(cat)
TOTAL=$(echo "$ISSUES_JSON" | jq 'length')

if [[ "$TOTAL" -eq 0 ]]; then
  echo '{"issues":{},"parallel_groups":[],"reasoning":"No issues"}'
  exit 0
fi

# ── Определить affected apps по labels и body ────────────────────────
declare -A ISSUE_APPS      # number -> comma-separated apps
declare -A HAS_MIGRATIONS  # number -> true/false
ALL_NUMBERS=()

for i in $(seq 0 $((TOTAL - 1))); do
  NUMBER=$(echo "$ISSUES_JSON" | jq -r ".[$i].number")
  TITLE=$(echo "$ISSUES_JSON" | jq -r ".[$i].title // \"\"")
  BODY=$(echo "$ISSUES_JSON" | jq -r ".[$i].body // \"\"")
  LABELS=$(echo "$ISSUES_JSON" | jq -r ".[$i].labels[].name" 2>/dev/null || echo "")

  ALL_NUMBERS+=("$NUMBER")
  APPS=""
  MIGRATIONS="false"

  # По лейблам
  if echo "$LABELS" | grep -qx "web"; then APPS="${APPS}apps/web,"; fi
  if echo "$LABELS" | grep -qx "api"; then APPS="${APPS}apps/api,"; fi
  if echo "$LABELS" | grep -qx "billing"; then APPS="${APPS}apps/billing-worker,"; fi
  # "ai" label — workers removed in issue #600

  # По title
  if echo "$TITLE" | grep -qi "(web)"; then APPS="${APPS}apps/web,"; fi
  if echo "$TITLE" | grep -qi "(api)"; then APPS="${APPS}apps/api,"; fi
  if echo "$TITLE" | grep -qi "(ingest)"; then APPS="${APPS}apps/ingest,"; fi
  if echo "$TITLE" | grep -qi "(processor)"; then APPS="${APPS}apps/processor,"; fi

  # По body
  if echo "$BODY" | grep -qi "@qurvo/db\|drizzle\|PostgreSQL schema"; then
    APPS="${APPS}packages/@qurvo/db,"
    MIGRATIONS="true"
  fi
  if echo "$BODY" | grep -qi "@qurvo/clickhouse\|ClickHouse migration"; then
    APPS="${APPS}packages/@qurvo/clickhouse,"
    MIGRATIONS="true"
  fi

  # По лейблу has-migrations
  if echo "$LABELS" | grep -qx "has-migrations"; then
    MIGRATIONS="true"
  fi

  # Дедупликация
  APPS=$(echo "$APPS" | tr ',' '\n' | sort -u | grep -v '^$' | tr '\n' ',' | sed 's/,$//')

  # Фоллбэк: если ничего не определили — помечаем как unknown
  if [[ -z "$APPS" ]]; then
    APPS="unknown"
  fi

  ISSUE_APPS[$NUMBER]="$APPS"
  HAS_MIGRATIONS[$NUMBER]="$MIGRATIONS"
done

# ── Построить группы параллелизации ──────────────────────────────────
# Правила:
#   1. Issues с пересекающимися apps → последовательно
#   2. Issues с has-migrations → ВСЕГДА последовательно друг с другом
#   3. Остальные → параллельно

# Простой жадный алгоритм: для каждого issue пытаемся добавить в существующую группу.
# Если конфликт — создаём новую группу.

declare -a GROUPS=()        # массив строк, каждая = числа через пробел
declare -a GROUP_APPS=()    # массив строк, каждая = apps через пробел (union)
declare -a GROUP_HAS_MIG=() # массив "true"/"false"

for NUMBER in "${ALL_NUMBERS[@]}"; do
  APPS="${ISSUE_APPS[$NUMBER]}"
  MIG="${HAS_MIGRATIONS[$NUMBER]}"
  PLACED=false

  for g in $(seq 0 $((${#GROUPS[@]} - 1))); do
    CONFLICT=false

    # Проверка 1: пересечение apps
    IFS=',' read -ra CURRENT_APPS <<< "$APPS"
    for a in "${CURRENT_APPS[@]}"; do
      if [[ "${GROUP_APPS[$g]}" == *"$a"* ]] && [[ "$a" != "unknown" ]]; then
        CONFLICT=true
        break
      fi
    done

    # Проверка 2: оба с миграциями
    if [[ "$MIG" == "true" ]] && [[ "${GROUP_HAS_MIG[$g]}" == "true" ]]; then
      CONFLICT=true
    fi

    if [[ "$CONFLICT" == "false" ]]; then
      GROUPS[$g]="${GROUPS[$g]} $NUMBER"
      GROUP_APPS[$g]="${GROUP_APPS[$g]},$APPS"
      if [[ "$MIG" == "true" ]]; then
        GROUP_HAS_MIG[$g]="true"
      fi
      PLACED=true
      break
    fi
  done

  if [[ "$PLACED" == "false" ]]; then
    GROUPS+=("$NUMBER")
    GROUP_APPS+=("$APPS")
    GROUP_HAS_MIG+=("$MIG")
  fi
done

# ── Вывод JSON ───────────────────────────────────────────────────────
ISSUES_OBJ="{"
FIRST=true
for NUMBER in "${ALL_NUMBERS[@]}"; do
  if [[ "$FIRST" == "true" ]]; then FIRST=false; else ISSUES_OBJ="${ISSUES_OBJ},"; fi
  TITLE=$(echo "$ISSUES_JSON" | jq -r ".[] | select(.number == $NUMBER) | .title")
  APPS="${ISSUE_APPS[$NUMBER]}"
  APPS_ARR=$(echo "$APPS" | tr ',' '\n' | grep -v '^$' | jq -R . | jq -s .)
  ISSUES_OBJ="${ISSUES_OBJ}\"$NUMBER\":{\"title\":$(echo "$TITLE" | jq -R .),\"affected\":$APPS_ARR}"
done
ISSUES_OBJ="${ISSUES_OBJ}}"

GROUPS_ARR="["
GFIRST=true
for g in $(seq 0 $((${#GROUPS[@]} - 1))); do
  if [[ "$GFIRST" == "true" ]]; then GFIRST=false; else GROUPS_ARR="${GROUPS_ARR},"; fi
  NUMS=$(echo "${GROUPS[$g]}" | xargs | tr ' ' ',')
  GROUPS_ARR="${GROUPS_ARR}[$NUMS]"
done
GROUPS_ARR="${GROUPS_ARR}]"

# Reasoning
REASONING="Детерминированная группировка по affected apps. Issues с пересекающимися apps идут последовательно. Issues с has-migrations никогда не параллелятся друг с другом."

jq -n \
  --argjson issues "$ISSUES_OBJ" \
  --argjson groups "$GROUPS_ARR" \
  --arg reasoning "$REASONING" \
  '{issues: $issues, parallel_groups: $groups, reasoning: $reasoning}'
