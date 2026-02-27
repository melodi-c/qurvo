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

**Валидация версии**: проверь `schema_version` в state файле. Если отсутствует или < 3 — state устаревший, используй fallback (Шаг 0.2) вместо него.

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

- **Issue закрыт + STATUS=READY_FOR_REVIEW** → нужен review + мерж (Шаг 6)
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
  "schema_version": 3,
  "started_at": "<ISO timestamp>",
  "phase": "EXECUTING_GROUP",
  "issues": {
    "42": {"title": "...", "status": "SOLVING", "branch": "fix/issue-42", "group": 0, "agent_id": "...", "worktree_path": "...", "merge_commit": "...", "pr_url": "..."},
    "43": {"title": "...", "status": "PENDING", "branch": "fix/issue-43", "group": 0, "agent_id": "...", "worktree_path": "..."}
  },
  "parallel_groups": [[42, 43], [44]],
  "current_group_index": 0,
  "parent_issues": {},
  "merge_results": {},
  "post_merge_verification": null
}
STATE
```

### State Schema

**Фазы executor** (`phase`):

| Фаза | Описание |
|------|----------|
| `PREFLIGHT` | Шаг 1.7 — issue-validator проверяет issues |
| `ANALYZING_INTERSECTIONS` | Шаг 2 — анализ пересечений |
| `EXECUTING_GROUP` | Шаг 5 — solver'ы работают |
| `REVIEWING` | Шаг 6 — review loop (lint, reviewer, security) |
| `MERGING` | Шаг 6 — мерж через merge-worktree.sh |
| `POST_MERGE_VERIFY` | Шаг 6.5 — verify-post-merge.sh |
| `REPORTING` | Шаг 7 — changelog + итоговый отчёт |
| `DONE` | Завершено |

**Статусы issue** (`issues[N].status`):

| Статус | Описание |
|--------|----------|
| `PENDING` | Ожидает выполнения |
| `SOLVING` | Solver работает |
| `READY_FOR_REVIEW` | Solver завершил, ожидает review |
| `REVIEWING` | Review loop в процессе |
| `REVIEW_PASSED` | Review пройден, готов к мержу |
| `MERGING` | Мерж в процессе |
| `MERGED` | Успешно смержен |
| `FAILED` | Ошибка на любом этапе |

**Поля state:**

| Поле | Тип | Описание |
|------|-----|----------|
| `schema_version` | `number` | Версия формата state (текущая: 3) |
| `started_at` | `string` | ISO timestamp начала выполнения |
| `phase` | `enum` | Текущая фаза executor (см. таблицу выше) |
| `issues` | `object` | Карта issue_number → состояние |
| `issues[N].title` | `string` | Заголовок issue |
| `issues[N].status` | `enum` | Статус issue (см. таблицу выше) |
| `issues[N].branch` | `string` | Имя ветки (`fix/issue-N`) |
| `issues[N].group` | `number` | Индекс группы параллелизации |
| `issues[N].agent_id` | `string` | ID подагента (для resume) |
| `issues[N].worktree_path` | `string` | Путь к worktree |
| `issues[N].merge_commit` | `string` | Hash коммита мержа (после успеха) |
| `issues[N].pr_url` | `string` | URL pull request (после мержа) |
| `parallel_groups` | `number[][]` | Группы параллельного выполнения |
| `current_group_index` | `number` | Индекс текущей группы |
| `parent_issues` | `object` | Карта parent → sub-issues |
| `merge_results` | `object` | Результаты мержей |
| `post_merge_verification` | `string\|null` | Результат post-merge верификации |

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

## Шаг 1.7: Валидация issues

Запусти `issue-validator` **параллельно** для каждого issue:

```
subagent_type: "issue-validator"
model: haiku
run_in_background: true
prompt: |
  ISSUE_NUMBER: <NUMBER>
  ISSUE_TITLE: <TITLE>
  ISSUE_BODY: <BODY>
  ISSUE_LABELS: <LABELS>
```

Обработай результаты:
- **READY** → продолжай
- **BLOCKED** → исключи issue, сообщи причину (зависимость не закрыта, etc.)
- **NEEDS_CLARIFICATION** → спроси пользователя:
  > Issues #N, #M требуют уточнения: <reasons>.
  > Продолжить без них?
  При отказе — остановись. При согласии — исключи эти issues.

Для issues с warning `size:l` — предложи пользователю запустить decomposer.

**Обнови state** с `phase: "PREFLIGHT"` перед запуском валидаторов.

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

Распарси JSON-ответ. Если невалиден — retry 1 раз с пометкой "Верни ТОЛЬКО валидный JSON". Если повторно невалиден — все issues последовательно (каждый в отдельной группе).

**Обнови state** с `phase: "ANALYZING_INTERSECTIONS"` и `parallel_groups`.

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

После успешного завершения ВСЕХ sub-issues — мержи feature branch в main через PR:

```bash
FEATURE_BRANCH="feature/issue-<PARENT_NUMBER>"

# Push feature branch (sub-issues уже смержены в неё)
git -C "$REPO_ROOT" push origin "$FEATURE_BRANCH"

# Создать PR: feature branch → main
PR_BODY="## Summary

All sub-issues merged into \`$FEATURE_BRANCH\`.

Closes #<PARENT_NUMBER>"

PARENT_PR_URL=$(gh pr create \
  --base main \
  --head "$FEATURE_BRANCH" \
  --title "Merge $FEATURE_BRANCH: <PARENT_ISSUE_TITLE>" \
  --body "$PR_BODY")

# Auto-merge PR
gh pr merge "$PARENT_PR_URL" --merge --delete-branch

# Обновить локальный main
git -C "$REPO_ROOT" pull origin main

gh issue close <PARENT_NUMBER> --comment "Все sub-issues реализованы. PR: $PARENT_PR_URL"
```

Parent issue **не передаётся** в issue-solver.

---

## Шаг 6: Обработка результатов + Review Loop

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
```

**Обнови state**: issue status → `READY_FOR_REVIEW`, phase → `REVIEWING`.

---

### STATUS: READY_FOR_REVIEW — Review Loop

Навесь лейбл `under-review`:
```bash
gh issue edit <NUMBER> --add-label "under-review"
```

#### 6.1 Lint Check

```
subagent_type: "lint-checker"
model: haiku
run_in_background: false
prompt: |
  WORKTREE_PATH: <абсолютный путь к worktree>
  AFFECTED_APPS: <список>
  BASE_BRANCH: <ветка>
```

- `PASS` → переходи к 6.2
- `FAIL` → format fixes → re-launch solver (max 1 retry):
  ```
  subagent_type: "issue-solver"
  run_in_background: false
  isolation: "worktree"
  prompt: |
    Исправь следующие lint-проблемы в worktree {WORKTREE_PATH}:
    <LINT_ISSUES>

    Issue #{NUMBER}: {TITLE}
    AFFECTED_APPS: {APPS}
    BASE_BRANCH: {BRANCH}
  ```

#### 6.2 Migration Validation (только если has-migrations)

Если issue имеет лейбл `has-migrations` или solver изменил файлы в `packages/@qurvo/db/drizzle/` или `packages/@qurvo/clickhouse/`:

```
subagent_type: "migration-validator"
model: sonnet
run_in_background: false
prompt: |
  WORKTREE_PATH: <абсолютный путь>
  BASE_BRANCH: <ветка>
```

- `PASS` или `WARN` → продолжай
- `FAIL` → re-launch solver с описанием проблем (max 1 retry)

#### 6.3 Logic Review + Security Check (параллельно)

Запусти `issue-reviewer` и `security-checker` **параллельно** (`run_in_background: true`):

**issue-reviewer**:
```
subagent_type: "issue-reviewer"
run_in_background: true
prompt: |
  WORKTREE_PATH: <абсолютный путь к worktree>
  ISSUE_NUMBER: <номер>
  ISSUE_TITLE: <заголовок issue>
  ISSUE_BODY: <тело issue — первые 500 символов>
  ACCEPTANCE_CRITERIA: <список acceptance criteria из issue body>
  AFFECTED_APPS: <список>
  BASE_BRANCH: <ветка>
  TEST_SUMMARY: <результаты тестов — passed/failed>
  CHANGED_FILES_SUMMARY: <список изменённых файлов — 1-2 строки на файл>
```

**security-checker**:
```
subagent_type: "security-checker"
model: haiku
run_in_background: true
prompt: |
  WORKTREE_PATH: <абсолютный путь к worktree>
  AFFECTED_APPS: <список>
  BASE_BRANCH: <ветка>
```

Дождись завершения обоих. Обработка результатов:

- **Оба APPROVE/PASS** → issue status → `REVIEW_PASSED` → переходи к 6.4 (мерж)
- **reviewer: REQUEST_CHANGES** или **security: FAIL** → structured feedback → re-launch solver (max 2 итерации)

**Structured feedback protocol** (передаётся solver'у при retry):
```
Исправь следующие проблемы в worktree {WORKTREE_PATH}:
1. [{SEVERITY}] {file}:{line} — {description}. Suggested: {code}
2. [{SEVERITY}] {file}:{line} — {description}. Suggested: {code}

Issue #{NUMBER}: {TITLE}
AFFECTED_APPS: {APPS}
BASE_BRANCH: {BRANCH}
```

Solver получает чёткие инструкции — не парсит reviewer JSON.

Если после 2-й итерации review всё ещё FAIL/REQUEST_CHANGES → эскалируй пользователю.

#### 6.4 Мерж

**Обнови state**: issue status → `MERGING`, phase → `MERGING`.

Определи AUTO_MERGE: если issue имеет label `size:l` или `needs-review` → `AUTO_MERGE="false"`.

```bash
cd "$REPO_ROOT"
MERGE_RESULT=$(bash "$CLAUDE_PROJECT_DIR/.claude/scripts/merge-worktree.sh" \
  "$WORKTREE_PATH" "$BRANCH" "$BASE_BRANCH" "$REPO_ROOT" "<ISSUE_TITLE>" \
  "<AFFECTED_APPS>" "<ISSUE_NUMBER>" "$AUTO_MERGE") || EXIT_CODE=$?
COMMIT_HASH=$(echo "$MERGE_RESULT" | grep -oP '(?<=COMMIT_HASH=)\S+')
PR_URL=$(echo "$MERGE_RESULT" | grep -oP '(?<=PR_URL=)\S+')
```

Обработка ошибок merge-скрипта по exit code:
- **exit 1** (merge conflict) → запусти `conflict-resolver`:
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
- **exit 2** (pre-merge build failed) → считай FAILED, добавь hint
- **exit 3** (push failed) → retry 1 раз, если повторно → FAILED
- **exit 4** (PR create failed) → retry 1 раз, если повторно → FAILED

**Обнови state**: issue status → `MERGED`, записать `pr_url` и `merge_commit`.

Сними лейблы и закрой:
```bash
gh issue edit <NUMBER> --remove-label "in-progress" --remove-label "under-review"
gh issue close <NUMBER> --comment "$(cat <<COMMENT
## ✅ Смерджено

**PR**: $PR_URL
**Коммит**: \`$COMMIT_HASH\`
**Ветка**: \`$BASE_BRANCH\`
**Файлы**: $FILES
**Тесты**: passed=$TESTS_PASSED failed=$TESTS_FAILED
**Build**: $BUILD
**Review**: APPROVE
**Lint**: PASS
COMMENT
)"
```

---

### STATUS: FAILED — Retry механизм

1. Прочитай причину из JSON output или AGENT_META `FAIL_REASON`
2. **Определи тип ошибки**:
   - **Test failure** → запусти `test-failure-analyzer` для диагностики, передай анализ как HINT при retry
   - **Build failure** → retry 1 раз с hint'ом об ошибке build
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

1. Проверь все issues со статусом `PENDING` в state файле
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
  echo "Post-merge verification: REGRESSION detected — запускаю rollback-agent" >&2

  # Подготовь JSON со смерженными issues этой группы
  # MERGED_ISSUES_JSON: [{"number": 42, "title": "...", "merge_commit": "...", "pr_url": "..."}, ...]

  # Запусти rollback-agent
  # subagent_type: "rollback-agent"
  # model: haiku
  # run_in_background: false
  # prompt: |
  #   REPO_ROOT: $REPO_ROOT
  #   BASE_BRANCH: main
  #   MERGED_ISSUES: $MERGED_ISSUES_JSON
  #   REGRESSION_DETAILS: <вывод verify-post-merge.sh>

  # Обработай результат:
  # - REVERTED → обнови state, добавь regression info в отчёт
  # - UNRESOLVABLE → эскалируй пользователю с деталями
fi
```

**Пропускай** этот шаг если в группе был только 1 issue.

---

## Шаг 6.7: OpenAPI post-merge

Если среди MERGED issues группы есть затрагивающие `apps/api` (AFFECTED_APPS содержит `api`):

```bash
cd "$REPO_ROOT"
pnpm swagger:generate && pnpm generate-api
# Проверь есть ли изменения в Api.ts
if ! git diff --quiet -- apps/web/src/api/generated/Api.ts; then
  git add apps/web/src/api/generated/Api.ts apps/api/docs/swagger.json
  git commit -m "chore: regenerate OpenAPI client"
  git push origin "$BASE_BRANCH"
fi
```

---

## Шаг 7: Changelog + Итоговый отчёт

### 7.1 Changelog (если 2+ issues смерджены)

Если в текущем прогоне успешно смерджены 2+ issues — запусти `changelog-generator`:

```
subagent_type: "changelog-generator"
model: haiku
run_in_background: false
prompt: |
  MERGED_ISSUES: <JSON массив смерженных issues с number, title, labels, pr_url, commit_hash>
  REPO_NAME: <owner/repo>
  POST_COMMENT: true
```

Включи changelog в итоговый отчёт.

### 7.2 Итоговый отчёт

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
7. **Мерж и review делает ТОЛЬКО оркестратор** (Шаг 6). Solver возвращает READY_FOR_REVIEW.
8. Если 1 issue — пропусти Шаг 2.
9. Sub-issues НИКОГДА не мержатся в `main` — только в feature branch parent'а.
10. Parent issue закрывается оркестратором (Шаг 5.3), не подагентом.
11. Post-merge верификация — только для групп из 2+ issues.
12. При compact recovery — читай state файл (Шаг 0.1), fallback на AGENT_META. schema_version < 3 = устаревший.
13. State файл обновляется после КАЖДОГО значимого шага с named phases (не номерами).
14. Retry FAILED issues максимум 1 раз. Review retry — максимум 2 итерации.
15. Conflict resolver — только при merge conflicts, не для других ошибок.
16. Issues с `size:l` или `needs-review` → `AUTO_MERGE="false"` (PR без автомержа).
17. OpenAPI regeneration — после мержа issues, затрагивающих `apps/api` (Шаг 6.7).
