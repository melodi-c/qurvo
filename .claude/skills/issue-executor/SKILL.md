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

### 0.1: Найди уже запущенных подагентов

Сначала загрузи инструменты управления задачами через ToolSearch:
```
ToolSearch: "select:TaskList"
```

Затем вызови `TaskList` без фильтров — получи все задачи. Найди задачи со статусом `running` или `pending`. Это подагенты, которые ещё выполняются. Запомни их `id` — они нужны для получения результатов.

### 0.2: Найди issues в статусе in-progress

```bash
gh issue list --label "in-progress" --state open --json number,title
```

### 0.3: Восстанови картину состояния

Сопоставь запущенных подагентов с issues:

- **Issue с `in-progress` + есть активный подагент** → НЕ запускай дубль. Загрузи инструмент `TaskOutput` через `ToolSearch: "select:TaskOutput"` и жди завершения (он завершится и придёт уведомление).
- **Issue с `in-progress`, но НЕТ активного подагента** → подагент упал без статуса. Сними лейбл `in-progress`, перезапусти подагента заново через Шаг 5.
- **Issue без `in-progress`** → ещё не был запущен. Запусти через Шаг 5.

### 0.4: Продолжи выполнение

После завершения всех восстановленных подагентов обработай результаты по Шагу 6 и выведи итоговый отчёт по Шагу 7.

---

## Шаг 1: Получить issues

Зафиксируй время старта для итогового отчёта:
```bash
START_TIME=$(date +%s)
```

Используй `gh` CLI для получения списка issues. Выбери подходящую команду на основе запроса пользователя:

```bash
# Примеры — адаптируй под запрос
gh issue list --state open --json number,title,body,labels
gh issue list --label ready --state open --json number,title,body,labels
gh issue view <N> --json number,title,body,labels,comments
```

Если пользователь указал конкретные номера -- получи каждый через `gh issue view`.
Если указал лейблы или описание -- используй `gh issue list` с фильтрами.

Результат: список issues с полями `number`, `title`, `body`, `labels`.

Если issues не найдены -- сообщи пользователю и останови выполнение.

---

## Шаг 1.5: Построить топологию sub-issues

Для каждого полученного issue проверь наличие sub-issues через GitHub API:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
# Для каждого NUMBER из списка:
gh api repos/$REPO/issues/<NUMBER>/sub_issues --jq '[.[] | {number, title, state}]' 2>/dev/null || echo "[]"
```

На основе ответов построй карту:
- **Standalone** — нет sub-issues и сам не является sub-issue другого → обычный flow, мержится в `main`
- **Parent** — имеет sub-issues → нужна feature branch `feature/issue-N`; sub-issues мержатся в неё, затем оркестратор мержит feature branch в `main` и закрывает parent issue
- **Sub-issue** — является sub-issue другого parent → получает `BASE_BRANCH: feature/issue-<PARENT_NUMBER>` в промпт

Если parent issue есть в списке, но его sub-issues ещё не вошли — автоматически добавь их через API и включи в план выполнения.

---

## Шаг 2: Анализ пересечений (foreground подагент)

Запусти подагента типа `general-purpose` **в foreground** (НЕ background -- оркестратор ждёт результат).

Промпт для подагента:

```
Ты -- аналитик зависимостей в monorepo Qurvo.

Структура проекта:
- Apps: @qurvo/api (apps/api), @qurvo/ingest (apps/ingest), @qurvo/processor (apps/processor), @qurvo/cohort-worker (apps/cohort-worker), @qurvo/billing-worker (apps/billing-worker), @qurvo/web (apps/web)
- Packages: @qurvo/db (packages/@qurvo/db), @qurvo/clickhouse (packages/@qurvo/clickhouse), @qurvo/sdk-core, @qurvo/sdk-browser, @qurvo/sdk-node, @qurvo/distributed-lock, @qurvo/worker-core, @qurvo/testing

Вот список issues:
<ВСТАВИТЬ СЮДА JSON С ISSUES>

Для каждого issue определи:
1. Какие apps и packages он затрагивает (по title, body, labels)
2. Какие issues могут выполняться параллельно (не пересекаются по затрагиваемым файлам/модулям)
3. Какие issues должны выполняться последовательно (пересекаются)

ВАЖНО — обязательные правила параллелизации:
- Если два или более issues затрагивают схему БД (`packages/@qurvo/db` или `packages/@qurvo/clickhouse`) — они ВСЕГДА должны быть в РАЗНЫХ последовательных группах, даже если остальной код не пересекается. Параллельная генерация миграций создаёт дублирующие номера. Сигналы: лейбл `has-migrations` или упоминание DB/ClickHouse в body.
- Если issue затрагивает `packages/@qurvo/db` и другой затрагивает только `apps/*` без изменения схемы — они могут быть параллельными.

Верни ТОЛЬКО JSON в таком формате, без другого текста:
{
  "issues": {
    "42": { "title": "...", "affected": ["apps/api", "packages/@qurvo/db"] },
    "45": { "title": "...", "affected": ["apps/web"] }
  },
  "parallel_groups": [
    [42, 45],
    [43]
  ],
  "reasoning": "Issues 42 и 45 затрагивают разные модули, поэтому могут выполняться параллельно. Issue 43 затрагивает apps/api так же как 42, поэтому идёт после."
}
```

Распарси JSON-ответ подагента. Если ответ невалиден -- попроси переделать (максимум 1 повтор).

---

## Шаг 3: Санитарные проверки окружения

Перед запуском любых подагентов выполни:

```bash
# Проверка 1: нет мусорных директорий-опечаток рядом с .claude
for bad_dir in .claire .claud .cloude claude; do
  [ ! -d "$REPO_ROOT/$bad_dir" ] \
    || echo "ВНИМАНИЕ: найдена подозрительная директория $REPO_ROOT/$bad_dir — удали её вручную"
done

# Проверка 2: рабочая директория для worktree существует и называется правильно
[ -d "$REPO_ROOT/.claude/worktrees" ] || mkdir -p "$REPO_ROOT/.claude/worktrees"
echo "Worktree dir: $REPO_ROOT/.claude/worktrees"
```

---

## Шаг 4: Подготовка лейбла in-progress

Перед запуском первой группы убедись что лейбл существует:

```bash
gh label create "in-progress" --description "Currently being worked on" --color "0052CC" 2>/dev/null || true
gh label create "blocked" --description "Blocked, needs attention" --color "B60205" 2>/dev/null || true
gh label create "ready" --description "Ready to be worked on" --color "0E8A16" 2>/dev/null || true
gh label create "needs-clarification" --description "Needs clarification before work can begin" --color "FBCA04" 2>/dev/null || true
gh label create "has-migrations" --description "Requires DB or ClickHouse migrations" --color "C5DEF5" 2>/dev/null || true
gh label create "size:xs" --description "Extra small: <30 min" --color "F9D0C4" 2>/dev/null || true
gh label create "size:s"  --description "Small: <2 hours" --color "F9D0C4" 2>/dev/null || true
gh label create "size:m"  --description "Medium: <1 day" --color "E4E669" 2>/dev/null || true
gh label create "size:l"  --description "Large: >1 day" --color "D93F0B" 2>/dev/null || true
```

---

## Шаг 5: Запуск issue-solver подагентов (background)

### 5.1 Подготовка feature branches для parent issues

Для каждого **parent issue** (у которого есть sub-issues) создай feature branch ДО запуска любых подагентов:

```bash
FEATURE_BRANCH="feature/issue-<PARENT_NUMBER>"
git -C "$REPO_ROOT" branch "$FEATURE_BRANCH" main
git -C "$REPO_ROOT" push origin "$FEATURE_BRANCH"
echo "Создана feature branch: $FEATURE_BRANCH"
```

### 5.2 Порядок выполнения групп

Sub-issues одного parent запускаются РАНЬШЕ остальных групп (они должны быть первой группой в `parallel_groups` для данного parent).

Для каждой группы из `parallel_groups`:

1. **Навесь лейбл `in-progress`** на все issues группы перед запуском:
   ```bash
   gh issue edit <NUMBER> --add-label "in-progress"
   ```
2. Запусти всех подагентов группы **одновременно** как background (`run_in_background: true`, `subagent_type: "issue-solver"`, **`isolation: "worktree"`** — обязательно!)
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

> **Примечание**: если `AFFECTED_APPS` содержит `apps/web` и issue (title/body) упоминает `.stories.tsx` файлы — issue-solver автоматически запустит `pnpm --filter @qurvo/web build-storybook` как часть DoD (шаг 4.3 Build). Дополнительных инструкций в промпте не нужно.

### 5.3 Финализация parent issue

После успешного завершения ВСЕХ sub-issues одного parent — оркестратор сам мержит feature branch в main и закрывает parent issue:

```bash
FEATURE_BRANCH="feature/issue-<PARENT_NUMBER>"

# Мерж feature branch в main
MAIN_BEFORE=$(git -C "$REPO_ROOT" rev-parse main)
git -C "$REPO_ROOT" checkout main
git -C "$REPO_ROOT" merge "$FEATURE_BRANCH"
MAIN_AFTER=$(git -C "$REPO_ROOT" rev-parse main)
[ "$MAIN_BEFORE" != "$MAIN_AFTER" ] \
  || { echo "FATAL: мерж feature branch не продвинул main"; exit 1; }

git -C "$REPO_ROOT" push origin main

# Закрыть parent issue и удалить feature branch
gh issue close <PARENT_NUMBER> --comment "Все sub-issues реализованы и смерджены через $FEATURE_BRANCH в main."
git -C "$REPO_ROOT" branch -d "$FEATURE_BRANCH"
git -C "$REPO_ROOT" push origin --delete "$FEATURE_BRANCH"
```

Parent issue **не передаётся** в issue-solver — он является только трекером sub-issues.

---

## Шаг 6: Обработка результатов

После завершения каждого background подагента, прочитай его результат и найди строку `STATUS:`.

- `STATUS: SUCCESS` — подагент реализовал задачу, issue закрыт. Оркестратор делает мерж:
  1. Сними лейбл `in-progress`: `gh issue edit <NUMBER> --remove-label "in-progress"`
  2. Получи `BRANCH` из результата подагента (строка вида `BRANCH: fix/issue-<NUMBER>`) и путь к worktree из Task tool result (`worktree_path`).
  3. **Смержи ветку в BASE_BRANCH** (fast-forward без переключения текущей ветки):
     ```bash
     BASE_BEFORE=$(git -C "$REPO_ROOT" rev-parse "$BASE_BRANCH")
     git -C "$REPO_ROOT" fetch "$WORKTREE_PATH" "fix/issue-<NUMBER>:$BASE_BRANCH"
     BASE_AFTER=$(git -C "$REPO_ROOT" rev-parse "$BASE_BRANCH")
     [ "$BASE_BEFORE" != "$BASE_AFTER" ] \
       || { echo "FATAL: мерж не продвинул $BASE_BRANCH"; }
     ```
  4. **Запушь** в origin:
     ```bash
     git -C "$REPO_ROOT" push origin "$BASE_BRANCH"
     ```
  5. **Очисти** ветку и worktree:
     ```bash
     git -C "$REPO_ROOT" worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
     git -C "$REPO_ROOT" branch -D "fix/issue-<NUMBER>" 2>/dev/null || true
     ```
  6. **ВАЖНО**: после `worktree remove` перейди в `$REPO_ROOT` перед любыми `gh` командами — иначе `gh` внутри вызывает `git` с CWD удалённой директории и падает с `fatal: Unable to read current working directory`:
     ```bash
     cd "$REPO_ROOT"
     ```
  7. Проверь что целевая ветка продвинулась (`BASE_BEFORE != BASE_AFTER`) — если нет, считай FAILED.
- `STATUS: NEEDS_USER_INPUT | <причина>` — два случая:
  - **Причина содержит "слишком большой"** → запусти `issue-decomposer` в foreground:
    ```
    ISSUE_NUMBER: <NUMBER>
    ISSUE_TITLE: <TITLE>
    ISSUE_BODY: <BODY>
    REPO_ROOT: <REPO_ROOT>
    ```
    Если decomposer вернул `"atomic": true` → сообщи пользователю что issue атомарный но solver не справился, обработай как обычный NEEDS_USER_INPUT.
    Если decomposer вернул список sub_issues → создай их через `gh issue create` последовательно (сохраняя номера для зависимостей), привяжи к оригинальному issue как sub-issues через GitHub API (аналогично Шагу 6 issue-planner), сними лейбл `in-progress` с оригинального issue, добавь новые issues в очередь текущей или следующей группы выполнения.
  - **Любая другая причина** → оставь лейбл `in-progress` пока ждёшь ответа. Немедленно сообщи пользователю, передай причину. После ответа пользователя -- перезапусти подагента с дополненным промптом: добавь уточнение пользователя в секцию "Задача" и добавь строку `WORKTREE_PATH: <путь из Task tool result>` — агент войдёт в существующий worktree, не создавая новый. Запускай с `isolation: "worktree"` как обычно (агент определит что worktree уже есть).
- `STATUS: FAILED | <причина>` — сними лейбл `in-progress`: `gh issue edit <NUMBER> --remove-label "in-progress"`. Добавь в отчёт как failed.

Если строка STATUS не найдена -- считай результат как FAILED с причиной "подагент не вернул статус". Сними лейбл `in-progress`.

---

## Шаг 7: Итоговый отчёт

После завершения ВСЕХ групп и всех подагентов, выведи сводку. Зафиксируй время старта в начале работы (`START_TIME=$(date +%s)`) и вычисли elapsed в конце.

```
## Итог выполнения issues

| # | Issue | Статус | Тесты | Review | Детали |
|---|-------|--------|-------|--------|--------|
| 1 | #42 "Title" | ✅ SUCCESS | ✅ passed | ✅ APPROVE (1 iter) | Смерджено в main |
| 2 | #43 "Title" | ❌ FAILED  | ❌ failed | —                  | TypeError в funnel.service.ts:42 |
| 3 | #45 "Title" | ⏳ NEEDS_INPUT | —  | —                  | Issue слишком размытый |

Выполнено: N из M  |  Время: X мин  |  Групп параллельного запуска: G
```

Если есть FAILED или NEEDS_INPUT — добавь секцию рекомендаций:

```
### Рекомендации
- **#43**: исправить падающие тесты → `/issue-executor 43` после фикса
- **#45**: уточнить acceptance criteria → запустить `/issue-validator 45` затем `/issue-executor 45`
```

---

## Критические правила

1. Ты -- ТОЛЬКО оркестратор. Не пиши код, не редактируй файлы, не запускай тесты. Только координируй подагентов.
2. Все issue-solver подагенты запускаются как `subagent_type: "issue-solver"`, `run_in_background: true`, **`isolation: "worktree"`** (без этого агент будет писать в main!).
3. Подагент анализа пересечений (Шаг 2) запускается в foreground (`subagent_type: "general-purpose"`) -- ты ждёшь его результат.
4. Если в группе один issue -- всё равно запусти его как background подагента, не делай сам.
5. При перезапуске подагента (после NEEDS_USER_INPUT) -- передай `WORKTREE_PATH` из Task tool result предыдущего запуска, запускай снова с `isolation: "worktree"`.
6. Не запрашивай подтверждение у пользователя перед запуском подагентов, если план ясен. Действуй автономно.
7. **Мерж в main/BASE_BRANCH делает ТОЛЬКО оркестратор** (Шаг 6) — issue-solver только реализует и коммитит.
7. Если пользователь дал всего 1 issue -- пропусти Шаг 2 (анализ пересечений), сразу запусти одного подагента.
8. Sub-issues НИКОГДА не мержатся напрямую в `main` — только в feature branch своего parent issue.
9. Parent issue закрывается оркестратором (Шаг 5.3), НЕ подагентом — не передавай parent issue в issue-solver как задачу на реализацию.
