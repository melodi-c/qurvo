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

### 0.1: Прочитай state файл

```bash
STATE_FILE="$CLAUDE_PROJECT_DIR/.claude/state/execution-state.json"
if [ -f "$STATE_FILE" ]; then
  cat "$STATE_FILE"
fi
```

State файл содержит полное состояние выполнения: список issues, их статусы, группы, результаты. Продолжи с того шага, на котором остановился.

### 0.2: Fallback — если state файла нет

Найди issues в статусе in-progress:

```bash
gh issue list --label "in-progress" --state open --json number,title
```

Для каждого in-progress issue проверь AGENT_META:
```bash
LAST_COMMENT=$(gh issue view <NUMBER> --json comments --jq '.comments[-1].body')
STATUS=$(echo "$LAST_COMMENT" | grep -oP '(?<=STATUS=)\S+' || echo "UNKNOWN")
BRANCH=$(echo "$LAST_COMMENT" | grep -oP '(?<=BRANCH=)\S+' || echo "")
```

- **Issue закрыт + STATUS=SUCCESS** → нужен мерж (Шаг 6)
- **Issue открыт + нет AGENT_META** → перезапусти через Шаг 5

### 0.3: Продолжи выполнение

После восстановления состояния продолжи с соответствующего шага.

---

## State Persistence

**После каждого значимого шага** (получение issues, анализ, запуск solver, результат solver, мерж) — обнови state файл:

```bash
mkdir -p "$CLAUDE_PROJECT_DIR/.claude/state"
cat > "$CLAUDE_PROJECT_DIR/.claude/state/execution-state.json" <<'STATE'
{
  "started_at": "<ISO timestamp>",
  "current_step": "<step number>",
  "issues": {
    "42": {"title": "...", "status": "pending|running|success|failed|needs_input", "branch": "fix/issue-42", "group": 0, "agent_id": "...", "worktree_path": "...", "merge_commit": "..."},
    "43": {"title": "...", "status": "running", "branch": "fix/issue-43", "group": 0, "agent_id": "...", "worktree_path": "..."}
  },
  "parallel_groups": [[42, 43], [44]],
  "current_group_index": 0,
  "parent_issues": {},
  "merge_results": {},
  "post_merge_verification": null
}
STATE
```

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

**Обнови state файл** с полученным списком issues.

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

## Шаг 1.7: Pre-flight проверка

Запусти `pre-flight-checker` **параллельно** для каждого issue:

```
subagent_type: "pre-flight-checker"
model: haiku
run_in_background: true
prompt: |
  ISSUE_NUMBER: <NUMBER>
  ISSUE_TITLE: <TITLE>
  ISSUE_BODY: <BODY>
  ISSUE_LABELS: <LABELS>
```

Обработай результаты:
- **BLOCKED** → исключи issue, сообщи причину (зависимость не закрыта, etc.)
- **WARN** → продолжай, но запомни warnings (size:l → рассмотри декомпозицию)
- **READY** → продолжай

Для issues с `WARN` + `size:l` — предложи пользователю запустить decomposer.

---

## Шаг 2: Анализ пересечений

### Если issues == 1: пропусти анализ

### Если issues == 2-3: определи affected apps самостоятельно

По labels и title/body:
- Лейбл `web` или `(web)` в title → `apps/web`
- Лейбл `api` или `(api)` в title → `apps/api`
- Лейбл `has-migrations` или упоминание `@qurvo/db` / `@qurvo/clickhouse` → соответствующие packages
- Лейблы `billing`, `ai`, `security` → соответствующие workers

Правило: пересекающиеся apps → последовательно. `has-migrations` → ВСЕГДА последовательно друг с другом. Остальные → параллельно.

### Если issues >= 4: запусти intersection-analyzer

```
subagent_type: "intersection-analyzer"
model: sonnet
run_in_background: false
prompt: |
  Проанализируй пересечения для параллелизации:
  <ISSUES_JSON>
```

Распарси JSON-ответ. Если невалиден — fallback на скрипт:
```bash
echo '<ISSUES_JSON>' | bash "$CLAUDE_PROJECT_DIR/.claude/scripts/analyze-intersections.sh"
```

**Обнови state файл** с parallel_groups.

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

Проверь наличие лейблов одним запросом:

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
4. **Обработай результаты** (Шаг 6) — мерж + retry при FAILED
5. **Dependency watcher** (Шаг 6.3) — проверь разблокированные issues
6. Только после этого запусти следующую группу

### Промпт для каждого issue-solver подагента

Для **standalone issues** (BASE_BRANCH = main):
```
Issue #{ISSUE_NUMBER}: {ISSUE_TITLE}

{ISSUE_BODY}

{ISSUE_COMMENTS — если есть}

AFFECTED_APPS: {AFFECTED_APPS из анализа пересечений}
RELATED_ISSUES: {номера и заголовки других issues в этой группе}
RECENT_CHANGES: {git log --oneline -5 -- <AFFECTED_APPS paths> — кратко что менялось недавно}
```

Для **sub-issues** (добавить BASE_BRANCH):
```
Issue #{ISSUE_NUMBER}: {ISSUE_TITLE}

{ISSUE_BODY}

{ISSUE_COMMENTS — если есть}

AFFECTED_APPS: {AFFECTED_APPS из анализа пересечений}
BASE_BRANCH: feature/issue-{PARENT_NUMBER}
RELATED_ISSUES: {другие sub-issues этого parent}
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

**Primary**: найди JSON и `STATUS:` в Task tool output.
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
4. Если merge-скрипт вернул exit 1 (конфликт) → запусти `conflict-resolver`:
   ```
   subagent_type: "conflict-resolver"
   model: opus
   run_in_background: false
   prompt: |
     WORKTREE_PATH: <path>
     BRANCH: <branch>
     BASE_BRANCH: <base>
     ISSUE_A_TITLE: <текущий issue title>
     ISSUE_B_TITLE: <issue что уже в base branch>
   ```
   - `RESOLVED` → повтори мерж
   - `UNRESOLVABLE` → считай FAILED
5. **Обнови state файл**
6. **Добавь итоговый комментарий**:
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

### STATUS: FAILED — Retry механизм

1. Прочитай причину из JSON output или AGENT_META `FAIL_REASON`
2. **Определи тип ошибки**:
   - **Build/test failure** → retry 1 раз с hint'ом об ошибке в промпте
   - **Review не пройден 2 раза** → эскалация пользователю
   - **Merge conflict** → пробуй conflict-resolver
   - **Другое** → эскалация пользователю

3. **Retry** (максимум 1 раз):
   ```
   subagent_type: "issue-solver"
   run_in_background: true
   isolation: "worktree"
   prompt: |
     RETRY: предыдущая попытка завершилась ошибкой.
     FAIL_REASON: <причина из первой попытки>
     HINT: <что нужно исправить — конкретный файл, ошибка, тест>

     Issue #{NUMBER}: {TITLE}
     {BODY}
     ...остальной промпт как обычно...
   ```

4. Если retry тоже FAILED → сними `in-progress`, добавь в отчёт, эскалируй:
   ```bash
   gh issue edit <NUMBER> --remove-label "in-progress"
   gh issue edit <NUMBER> --add-label "blocked"
   ```

### STATUS: NEEDS_USER_INPUT

- **Причина содержит "слишком большой"** → запусти `issue-decomposer` в foreground. Если вернул `"atomic": true` → эскалируй пользователю. Если вернул sub_issues → создай через `gh issue create`, привяжи к оригинальному issue.
- **Любая другая причина** → сообщи пользователю. При ответе — перезапусти подагента с дополненным промптом + `WORKTREE_PATH`.

### STATUS не найден (ни в output, ни в AGENT_META)

Считай FAILED с причиной "подагент не вернул статус". Retry 1 раз. Если повторно нет статуса → сними `in-progress`.

**Обнови state файл** после каждого обработанного результата.

---

## Шаг 6.3: Dependency watcher

После обработки результатов каждой группы:

1. Проверь все issues со статусом `pending` в state файле
2. Для каждого — проверь `Depends on: #N` в body
3. Если зависимость только что была закрыта (SUCCESS + merged) → issue разблокирован
4. Добавь разблокированные issues в следующую группу (если не конфликтуют с уже запланированными)

```bash
# Пример: issue #45 зависел от #42, #42 только что был смержен
# → добавь #45 в текущий или следующий parallel_groups
```

**Обнови state файл** с обновлёнными группами.

---

## Шаг 6.5: Pre-merge верификация

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

| # | Issue | Статус | Тесты | Review | Lint | Детали |
|---|-------|--------|-------|--------|------|--------|
| 1 | #42 "Title" | ✅ SUCCESS | ✅ passed | ✅ APPROVE | ✅ PASS | Смерджено в main |
| 2 | #43 "Title" | ❌ FAILED  | ❌ failed | —         | —    | TypeError в foo.ts:42 |
| 3 | #44 "Title" | 🔄 RETRIED → ✅ | ✅ passed | ✅ APPROVE | ✅ PASS | Успешно после retry |
| 4 | #45 "Title" | ⏳ NEEDS_INPUT | —  | —         | —    | Issue слишком размытый |

Выполнено: N из M  |  Retries: R  |  Время: X мин  |  Групп: G
```

Если есть FAILED или NEEDS_INPUT — добавь рекомендации:

```
### Рекомендации
- **#43**: исправить падающие тесты → `/issue-executor 43`
- **#45**: уточнить acceptance criteria → обнови описание, затем `/issue-executor 45`
```

**Очисти state файл** после завершения:
```bash
rm -f "$CLAUDE_PROJECT_DIR/.claude/state/execution-state.json"
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
12. При compact recovery — читай state файл (Шаг 0.1), fallback на AGENT_META.
13. State файл обновляется после КАЖДОГО значимого шага.
14. Retry FAILED issues максимум 1 раз.
15. Conflict resolver — только при merge conflicts, не для других ошибок.
