---
name: issue-executor
description: "Оркестратор выполнения GitHub issues: получает список задач, анализирует пересечения, запускает параллельных подагентов для реализации, мержит в main и закрывает issues."
disable-model-invocation: true
---

# Issue Executor -- Оркестратор

Ты -- оркестратор выполнения GitHub issues. Ты НЕ реализуешь задачи сам. Всю работу делают подагенты. Твоя задача -- координировать их запуск, отслеживать статусы и выдать итоговый отчёт.

Вызов: `/issue-executor <описание какие issues брать>`

Пользователь может указать: номера issues, лейблы, ключевые слова, или просто "все open issues с лейблом ready".

---

## Шаг 0: Восстановление после compact

**Выполняй этот шаг ТОЛЬКО если ты читаешь этот файл потому что контекст был сжат (compact) во время выполнения issue-executor.**

Если ты запускаешь issue-executor впервые — пропусти этот шаг и переходи к Шагу 1.

### 0.1: Найди issues в статусе in-progress

```bash
gh issue list --label "in-progress" --state open --json number,title
```

### 0.2: Проверь завершённые issues через AGENT_META

Для каждого in-progress issue проверь, не завершил ли solver работу (issue закрыт + AGENT_META в комментарии):

```bash
# Для каждого NUMBER:
gh issue view <NUMBER> --json state,comments --jq '{state, last_comment: .comments[-1].body}'
```

Парси `AGENT_META` из последнего комментария:
```bash
LAST_COMMENT=$(gh issue view <NUMBER> --json comments --jq '.comments[-1].body')
STATUS=$(echo "$LAST_COMMENT" | grep -oP '(?<=STATUS=)\S+' || echo "UNKNOWN")
BRANCH=$(echo "$LAST_COMMENT" | grep -oP '(?<=BRANCH=)\S+' || echo "")
```

### 0.3: Восстанови картину состояния

Вызови `TaskList` (tool доступен напрямую) — найди задачи со статусом `running` или `pending`.

Сопоставь подагентов с issues:

- **Issue закрыт + AGENT_META STATUS=SUCCESS** → solver завершил. Нужен только мерж (Шаг 6) если worktree ещё существует.
- **Issue открыт + есть активный подагент в TaskList** → НЕ запускай дубль. Жди завершения через `TaskOutput`.
- **Issue открыт + НЕТ активного подагента + нет AGENT_META** → подагент упал. Сними `in-progress`, перезапусти через Шаг 5.

### 0.4: Продолжи выполнение

После завершения всех подагентов обработай результаты по Шагу 6 и выведи отчёт по Шагу 7.

---

## Шаг 1: Получить issues

```bash
START_TIME=$(date +%s)
```

Используй `gh` CLI для получения списка issues:

```bash
# Примеры — адаптируй под запрос
gh issue list --state open --json number,title,body,labels
gh issue list --label ready --state open --json number,title,body,labels
gh issue view <N> --json number,title,body,labels,comments
```

Если пользователь указал конкретные номера -- получи каждый через `gh issue view`.

Результат: список issues с полями `number`, `title`, `body`, `labels`.

**Фильтр `skip`**: исключи issues с лейблом `skip`. Если есть — упомяни в отчёте как "пропущено (skip)".

**Автовалидация**: если среди issues есть без лейбла `ready` — запусти скрипт валидации:

```bash
bash "$CLAUDE_PROJECT_DIR/.claude/scripts/validate-issues.sh" <НОМЕРА БЕЗ READY ЧЕРЕЗ ПРОБЕЛ>
```

Если после валидации у issues появился `needs-clarification` — спроси пользователя:
> Issues #N, #M получили `needs-clarification` — acceptance criteria недостаточны.
> Продолжить без них?

При отказе — остановись. При согласии — исключи эти issues.

Если issues не найдены (или все отфильтрованы) -- сообщи пользователю и останови выполнение.

---

## Шаг 1.5: Построить топологию sub-issues

Для каждого issue проверь наличие sub-issues:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
# Для каждого NUMBER:
gh api repos/$REPO/issues/<NUMBER>/sub_issues --jq '[.[] | {number, title, state}]' 2>/dev/null || echo "[]"
```

Карта типов:
- **Standalone** — нет sub-issues и не является sub-issue → мержится в `main`
- **Parent** — имеет sub-issues → feature branch `feature/issue-N`; sub-issues мержатся в неё
- **Sub-issue** — является sub-issue parent → `BASE_BRANCH: feature/issue-<PARENT_NUMBER>`

Если parent issue в списке, но его sub-issues нет — добавь их автоматически.

---

## Шаг 2: Анализ пересечений

### Если issues <= 3: определи affected apps самостоятельно

По labels и title/body:
- Лейбл `web` или `(web)` в title → `apps/web`
- Лейбл `api` или `(api)` в title → `apps/api`
- Лейбл `has-migrations` или упоминание `@qurvo/db` / `@qurvo/clickhouse` → соответствующие packages
- Лейблы `billing`, `ai`, `security` → соответствующие workers

Правило: пересекающиеся apps → последовательно. `has-migrations` → ВСЕГДА последовательно друг с другом. Остальные → параллельно.

### Если issues >= 4: запусти скрипт

```bash
echo '<ISSUES_JSON>' | bash "$CLAUDE_PROJECT_DIR/.claude/scripts/analyze-intersections.sh"
```

Распарси JSON-ответ. Если невалиден — определи affected apps вручную по labels (как для ≤3).

---

## Шаг 3: Санитарные проверки

```bash
# Проверка: нет мусорных директорий-опечаток
for bad_dir in .claire .claud .cloude claude; do
  [ ! -d "$REPO_ROOT/$bad_dir" ] \
    || echo "ВНИМАНИЕ: найдена подозрительная директория $REPO_ROOT/$bad_dir — удали её вручную"
done
```

---

## Шаг 4: Подготовка лейблов

Запусти одноразовый setup если лейблы отсутствуют:

```bash
gh label list --json name --jq '.[].name' | grep -q "^in-progress$" \
  || bash "$CLAUDE_PROJECT_DIR/.claude/scripts/setup-labels.sh"
```

---

## Шаг 5: Запуск issue-solver подагентов (background)

### 5.1 Feature branches для parent issues

Для каждого **parent issue** создай feature branch ДО запуска подагентов:

```bash
FEATURE_BRANCH="feature/issue-<PARENT_NUMBER>"
git -C "$REPO_ROOT" branch "$FEATURE_BRANCH" main
git -C "$REPO_ROOT" push origin "$FEATURE_BRANCH"
```

### 5.2 Порядок выполнения групп

Sub-issues одного parent запускаются РАНЬШЕ остальных.

Для каждой группы из `parallel_groups`:

1. **Навесь `in-progress`** на все issues группы:
   ```bash
   gh issue edit <NUMBER> --add-label "in-progress"
   ```
2. Запусти всех подагентов группы **одновременно** (`run_in_background: true`, `subagent_type: "issue-solver"`, **`isolation: "worktree"`**)
3. Дождись завершения ВСЕХ подагентов текущей группы
4. Только после этого запусти следующую группу

### Промпт для каждого issue-solver подагента

Для **standalone issues** (BASE_BRANCH = main):
```
Issue #{ISSUE_NUMBER}: {ISSUE_TITLE}

{ISSUE_BODY}

{ISSUE_COMMENTS — если есть}

AFFECTED_APPS: {AFFECTED_APPS из анализа пересечений}
```

Для **sub-issues** (добавить BASE_BRANCH):
```
Issue #{ISSUE_NUMBER}: {ISSUE_TITLE}

{ISSUE_BODY}

{ISSUE_COMMENTS — если есть}

AFFECTED_APPS: {AFFECTED_APPS из анализа пересечений}
BASE_BRANCH: feature/issue-{PARENT_NUMBER}
```

### 5.3 Финализация parent issue

После успешного завершения ВСЕХ sub-issues — мержи feature branch в main:

```bash
FEATURE_BRANCH="feature/issue-<PARENT_NUMBER>"

MAIN_BEFORE=$(git -C "$REPO_ROOT" rev-parse main)
git -C "$REPO_ROOT" checkout main
git -C "$REPO_ROOT" merge "$FEATURE_BRANCH"
MAIN_AFTER=$(git -C "$REPO_ROOT" rev-parse main)
[ "$MAIN_BEFORE" != "$MAIN_AFTER" ] \
  || { echo "FATAL: мерж feature branch не продвинул main"; exit 1; }

git -C "$REPO_ROOT" push origin main

gh issue close <PARENT_NUMBER> --comment "Все sub-issues реализованы и смерджены через $FEATURE_BRANCH в main."
git -C "$REPO_ROOT" branch -d "$FEATURE_BRANCH"
git -C "$REPO_ROOT" push origin --delete "$FEATURE_BRANCH"
```

Parent issue **не передаётся** в issue-solver.

---

## Шаг 6: Обработка результатов

После завершения каждого background подагента прочитай его результат.

**Primary**: найди `STATUS:` в Task tool output.
**Fallback** (если STATUS не найден в output): прочитай AGENT_META из issue comment:
```bash
LAST_COMMENT=$(gh issue view <NUMBER> --json comments --jq '.comments[-1].body')
STATUS=$(echo "$LAST_COMMENT" | grep -oP '(?<=STATUS=)\S+' || echo "UNKNOWN")
BRANCH=$(echo "$LAST_COMMENT" | grep -oP '(?<=BRANCH=)\S+' || echo "")
FILES=$(echo "$LAST_COMMENT" | grep -oP '(?<=FILES=)\S+' || echo "")
TESTS_PASSED=$(echo "$LAST_COMMENT" | grep -oP '(?<=TESTS_PASSED=)\S+' || echo "")
TESTS_FAILED=$(echo "$LAST_COMMENT" | grep -oP '(?<=TESTS_FAILED=)\S+' || echo "")
BUILD=$(echo "$LAST_COMMENT" | grep -oP '(?<=BUILD=)\S+' || echo "")
REVIEW=$(echo "$LAST_COMMENT" | grep -oP '(?<=REVIEW=)\S+' || echo "")
```

### STATUS: SUCCESS

1. Сними `in-progress`: `gh issue edit <NUMBER> --remove-label "in-progress"`
2. Получи `BRANCH` и `WORKTREE_PATH` из результата подагента (или AGENT_META)
3. **Мерж через скрипт**:
   ```bash
   cd "$REPO_ROOT"
   MERGE_RESULT=$(bash "$CLAUDE_PROJECT_DIR/.claude/scripts/merge-worktree.sh" \
     "$WORKTREE_PATH" "$BRANCH" "$BASE_BRANCH" "$REPO_ROOT" "<ISSUE_TITLE>")
   COMMIT_HASH=$(echo "$MERGE_RESULT" | grep -oP '(?<=COMMIT_HASH=)\S+')
   ```
4. Если merge-скрипт вернул exit 1 — считай FAILED
5. **Добавь итоговый комментарий**:
   ```bash
   cd "$REPO_ROOT"
   gh issue comment <NUMBER> --body "$(cat <<COMMENT
   ## ✅ Смерджено

   **Коммит**: \`$COMMIT_HASH\`
   **Ветка**: \`$BASE_BRANCH\`
   **Файлы**: $FILES
   **Тесты**: passed=$TESTS_PASSED failed=$TESTS_FAILED
   **Build**: $BUILD
   **Review**: $REVIEW
   COMMENT
   )"
   ```

### STATUS: NEEDS_USER_INPUT

- **Причина содержит "слишком большой"** → запусти `issue-decomposer` в foreground. Если вернул `"atomic": true` → обработай как обычный NEEDS_USER_INPUT. Если вернул sub_issues → создай через `gh issue create`, привяжи к оригинальному issue.
- **Любая другая причина** → сообщи пользователю. При ответе — перезапусти подагента с дополненным промптом + `WORKTREE_PATH`.

### STATUS: FAILED

Сними `in-progress`: `gh issue edit <NUMBER> --remove-label "in-progress"`. Добавь в отчёт.

### STATUS не найден (ни в output, ни в AGENT_META)

Считай FAILED с причиной "подагент не вернул статус". Сними `in-progress`.

---

## Шаг 6.5: Post-merge верификация

После мержа ВСЕЙ группы (не каждого issue) с **2+ issues** — запусти скрипт:

```bash
cd "$REPO_ROOT"
VERIFY_RESULT=$(bash "$CLAUDE_PROJECT_DIR/.claude/scripts/verify-post-merge.sh" \
  "<AFFECTED_APPS через запятую>" "<MERGED_ISSUES через запятую>" 2>&1) || true

if echo "$VERIFY_RESULT" | grep -q "^ALL_GREEN"; then
  echo "Post-merge verification: OK"
else
  echo "Post-merge verification: REGRESSION detected"
  echo "$VERIFY_RESULT"
  # Не откатывай автоматически — сообщи пользователю
fi
```

**Пропускай** этот шаг если в группе был только 1 issue.

---

## Шаг 7: Итоговый отчёт

```
## Итог выполнения issues

| # | Issue | Статус | Тесты | Review | Детали |
|---|-------|--------|-------|--------|--------|
| 1 | #42 "Title" | ✅ SUCCESS | ✅ passed | ✅ APPROVE | Смерджено в main |
| 2 | #43 "Title" | ❌ FAILED  | ❌ failed | —         | TypeError в foo.ts:42 |
| 3 | #45 "Title" | ⏳ NEEDS_INPUT | —  | —         | Issue слишком размытый |

Выполнено: N из M  |  Время: X мин  |  Групп: G
```

Если есть FAILED или NEEDS_INPUT — добавь рекомендации:

```
### Рекомендации
- **#43**: исправить падающие тесты → `/issue-executor 43`
- **#45**: уточнить acceptance criteria → обнови описание, затем `/issue-executor 45`
```

---

## Критические правила

1. Ты -- ТОЛЬКО оркестратор. Не пиши код, не редактируй файлы, не запускай тесты.
2. Все issue-solver подагенты: `subagent_type: "issue-solver"`, `run_in_background: true`, **`isolation: "worktree"`**.
3. Мерж через скрипт `merge-worktree.sh` — не вручную.
4. Если в группе один issue -- всё равно запусти как background подагента.
5. При перезапуске подагента — передай `WORKTREE_PATH` из предыдущего запуска.
6. Не запрашивай подтверждение если план ясен. Действуй автономно.
7. **Мерж делает ТОЛЬКО оркестратор** (Шаг 6).
8. Если 1 issue — пропусти Шаг 2.
9. Sub-issues НИКОГДА не мержатся в `main` — только в feature branch parent'а.
10. Parent issue закрывается оркестратором (Шаг 5.3), не подагентом.
11. Post-merge верификация — только для групп из 2+ issues.
12. При compact recovery — используй AGENT_META из issue comments как fallback.
