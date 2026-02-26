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
- Если два или более issues затрагивают схему БД (`packages/@qurvo/db` или `packages/@qurvo/clickhouse`) — они ВСЕГДА должны быть в РАЗНЫХ последовательных группах, даже если остальной код не пересекается. Параллельная генерация миграций создаёт дублирующие номера.
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
```

---

## Шаг 5: Запуск issue-solver подагентов (background)

Для каждой группы из `parallel_groups`:

1. **Навесь лейбл `in-progress`** на все issues группы перед запуском:
   ```bash
   gh issue edit <NUMBER> --add-label "in-progress"
   ```
2. Запусти всех подагентов группы **одновременно** как background (`run_in_background: true`, `subagent_type: "issue-solver"`)
3. Дождись завершения ВСЕХ подагентов текущей группы
4. Только после этого запусти следующую группу

### Промпт для каждого issue-solver подагента

Передай только конкретные данные — инструкции хранятся в самом агенте:

```
Issue #{ISSUE_NUMBER}: {ISSUE_TITLE}

{ISSUE_BODY}

{ISSUE_COMMENTS — если есть}

AFFECTED_APPS: {AFFECTED_APPS из анализа пересечений}
```

---

## Шаг 6: Обработка результатов

После завершения каждого background подагента, прочитай его результат и найди строку `STATUS:`.

- `STATUS: SUCCESS` — выполни следующие проверки:
  1. Сними лейбл `in-progress`: `gh issue edit <NUMBER> --remove-label "in-progress"`
  2. **Проверь что мерж попал в локальный main** (ветка fix/issue-N должна быть удалена подагентом):
     ```bash
     git -C "$REPO_ROOT" branch --list "fix/issue-<NUMBER>"
     # Если ветка ещё существует — подагент не сделал мерж в local main. Это FAILED.
     ```
  3. Проверь что локальный main продвинулся:
     ```bash
     git -C "$REPO_ROOT" log main --oneline -3
     # Убедись что последний коммит относится к данному issue
     ```
  4. Если проверки прошли — добавь в отчёт как успешный. Если нет — считай FAILED.
- `STATUS: NEEDS_USER_INPUT | <причина>` — оставь лейбл `in-progress` пока ждёшь ответа. Немедленно сообщи пользователю, передай причину. После ответа пользователя -- перезапусти подагента с дополненным промптом (добавь уточнение пользователя в секцию "Задача").
- `STATUS: FAILED | <причина>` — сними лейбл `in-progress`: `gh issue edit <NUMBER> --remove-label "in-progress"`. Добавь в отчёт как failed.

Если строка STATUS не найдена -- считай результат как FAILED с причиной "подагент не вернул статус". Сними лейбл `in-progress`.

---

## Шаг 7: Итоговый отчёт

После завершения ВСЕХ групп и всех подагентов, выведи сводку:

```
## Итог выполнения issues

| # | Issue | Статус | Детали |
|---|-------|--------|--------|
| 1 | #42 "Title" | SUCCESS | Смерджено в main |
| 2 | #43 "Title" | FAILED | Причина |
| 3 | #45 "Title" | NEEDS_USER_INPUT | Ожидает ответа |

Выполнено: N из M
```

---

## Критические правила

1. Ты -- ТОЛЬКО оркестратор. Не пиши код, не редактируй файлы, не запускай тесты. Только координируй подагентов.
2. Все issue-solver подагенты запускаются как `subagent_type: "issue-solver"`, `run_in_background: true`.
3. Подагент анализа пересечений (Шаг 2) запускается в foreground (`subagent_type: "general-purpose"`) -- ты ждёшь его результат.
4. Если в группе один issue -- всё равно запусти его как background подагента, не делай сам.
5. При перезапуске подагента (после NEEDS_USER_INPUT) -- используй тот же worktree path и branch name. Подагент должен проверить, существует ли worktree, и продолжить работу в нём.
6. Не запрашивай подтверждение у пользователя перед запуском подагентов, если план ясен. Действуй автономно.
7. Если пользователь дал всего 1 issue -- пропусти Шаг 2 (анализ пересечений), сразу запусти одного подагента.
