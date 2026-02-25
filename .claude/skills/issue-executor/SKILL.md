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

## Шаг 3: Запуск issue-solver подагентов (background)

Для каждой группы из `parallel_groups`:

1. Запусти всех подагентов группы **одновременно** как background (`run_in_background: true`)
2. Дождись завершения ВСЕХ подагентов текущей группы
3. Только после этого запусти следующую группу

### Промпт для каждого issue-solver подагента

Для каждого issue подставь конкретные значения в шаблон ниже и запусти подагента типа `general-purpose` с `run_in_background: true`:

```
Ты -- автономный разработчик в monorepo Qurvo. Твоя задача -- полностью реализовать GitHub issue #{ISSUE_NUMBER} и довести до мержа в main.

## Задача

Issue #{ISSUE_NUMBER}: {ISSUE_TITLE}

{ISSUE_BODY}

{ISSUE_COMMENTS -- если есть}

## Шаг 1: Создать worktree из ЛОКАЛЬНОГО main

КРИТИЧНО: Использовать ЛОКАЛЬНЫЙ main, НЕ origin/main.

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
MAIN_HASH=$(git rev-parse main)
BRANCH_NAME="fix/issue-{ISSUE_NUMBER}"
WORKTREE_PATH="$REPO_ROOT/.claude/worktrees/issue-{ISSUE_NUMBER}"

git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" "$MAIN_HASH"
cd "$WORKTREE_PATH"
```

Все дальнейшие действия выполняй ТОЛЬКО внутри worktree.

## Шаг 2: Проверить актуальность issue

До начала реализации:
1. Прочитай описание issue через `gh issue view {ISSUE_NUMBER} --json title,body,comments`
2. Поищи в кодовой базе релевантные файлы и символы
3. Проверь последние коммиты: `git log --oneline -20`
4. Если issue уже решён или устарел -- верни:
   STATUS: NEEDS_USER_INPUT | Issue #{ISSUE_NUMBER}, похоже, уже решён: <конкретное объяснение с доказательствами из кода/коммитов>

## Шаг 3: Реализация

- Реализуй задачу в worktree
- НЕ делай деструктивных git-операций (--force, reset --hard, checkout ., clean -f)
- Следуй CLAUDE.md соответствующего приложения (если есть)
- Используй абсолютные пути к файлам

## Шаг 4: Definition of Done

Последовательно выполни ВСЕ шаги. Определи какие apps затронуты ({AFFECTED_APPS}) и подставь их имена.

### 4.1 Тесты
```bash
pnpm --filter @qurvo/<app> exec vitest run
pnpm --filter @qurvo/<app> exec vitest run --config vitest.integration.config.ts
```
Если важные интеграционные тесты отсутствуют -- напиши их.

### 4.2 Миграции
- PostgreSQL: если изменилась схема -- `pnpm --filter @qurvo/db db:generate`
- ClickHouse: если изменилась схема -- `pnpm ch:generate <name>`

### 4.3 TypeScript
```bash
pnpm --filter @qurvo/<app> exec tsc --noEmit
```

### 4.4 Build
```bash
pnpm --filter @qurvo/<app> build
```

### 4.5 OpenAPI (ТОЛЬКО если затронут @qurvo/api)
```bash
pnpm --filter @qurvo/api build && pnpm swagger:generate && pnpm generate-api
```

Проверь swagger.json на пустые схемы:
```bash
node -e "
const s = require('./apps/api/docs/swagger.json');
const schemas = s.components?.schemas || {};
const bad = Object.entries(schemas).filter(([name, schema]) => {
  return schema.type === 'object' && !schema.properties && !schema.allOf && !schema.oneOf;
});
if (bad.length) { console.log('BAD SCHEMAS:'); bad.forEach(([n]) => console.log(' -', n)); process.exit(1); }
else console.log('OK');
"
```

Проверь Api.ts на плохие типы:
```bash
grep -n ': object\b\|Record<string, object>\|: any\b' apps/web/src/api/generated/Api.ts
```

Если нашлись проблемы -- исправь NestJS DTO/декораторы и перегенерируй.

### 4.6 Обновить CLAUDE.md
Если добавлены новые паттерны или gotcha -- обнови CLAUDE.md соответствующего приложения.

### 4.7 Коммит
```bash
git add <конкретные файлы>
git commit -m "<осмысленное сообщение>"
```

### 4.8 Финальная проверка с актуальным main
```bash
git merge main
# Если конфликты -- попытайся разрешить самостоятельно
# Если не получается -- верни STATUS: NEEDS_USER_INPUT | Merge conflict в <файлах>

pnpm --filter @qurvo/<app> exec vitest run
pnpm --filter @qurvo/<app> build
```

### 4.9 Мерж в main и push

ВАЖНО: эти команды выполняются в ОСНОВНОМ репозитории (не в worktree).
Поскольку REPO_ROOT ты сохранил в начале — используй его как абсолютный путь.

```bash
# Работаем с основным репозиторием через -C флаг (не cd)
git -C "$REPO_ROOT" checkout main
git -C "$REPO_ROOT" merge fix/issue-{ISSUE_NUMBER}
git -C "$REPO_ROOT" push origin main
```

### 4.10 SDK (только если были правки SDK-пакетов)
```bash
pnpm --filter @qurvo/sdk-core publish --access public --no-git-checks
pnpm --filter @qurvo/sdk-browser publish --access public --no-git-checks
pnpm --filter @qurvo/sdk-node publish --access public --no-git-checks
```

### 4.11 Закрыть issue и очистить worktree
```bash
gh issue close {ISSUE_NUMBER} --comment "Реализовано и смерджено в main."
git worktree remove "$WORKTREE_PATH"
git branch -d "fix/issue-{ISSUE_NUMBER}"
```

## Обработка ошибок

При ошибках на любом шаге DoD:
- Попытайся исправить (максимум 3 итерации)
- НЕ зацикливайся, НЕ делай деструктивных операций
- Если исправить не удалось:
  1. `gh issue comment {ISSUE_NUMBER} --body "Не удалось завершить: <причина>. Требует ручного вмешательства."`
  2. `gh issue edit {ISSUE_NUMBER} --add-label "blocked"` (если лейбл существует, иначе пропусти)
  3. Очисти worktree: `git worktree remove "$WORKTREE_PATH" --force; git branch -D "fix/issue-{ISSUE_NUMBER}" 2>/dev/null || true`
  4. Верни: STATUS: FAILED | <конкретная причина с деталями>

## Формат финального ответа

Последняя строка твоего ответа ОБЯЗАТЕЛЬНО должна быть одной из:

STATUS: SUCCESS
STATUS: NEEDS_USER_INPUT | <причина>
STATUS: FAILED | <причина>
```

---

## Шаг 4: Обработка результатов

После завершения каждого background подагента, прочитай его результат и найди строку `STATUS:`.

- `STATUS: SUCCESS` -- issue выполнен. Добавь в отчёт как успешный.
- `STATUS: NEEDS_USER_INPUT | <причина>` -- нужно уточнение от пользователя. Немедленно сообщи пользователю, передай причину. После ответа пользователя -- перезапусти подагента с дополненным промптом (добавь уточнение пользователя в секцию "Задача").
- `STATUS: FAILED | <причина>` -- агент не справился. Добавь в отчёт как failed.

Если строка STATUS не найдена -- считай результат как FAILED с причиной "подагент не вернул статус".

---

## Шаг 5: Итоговый отчёт

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
2. Все issue-solver подагенты запускаются как `run_in_background: true`.
3. Подагент анализа пересечений (Шаг 2) запускается в foreground -- ты ждёшь его результат.
4. Если в группе один issue -- всё равно запусти его как background подагента, не делай сам.
5. При перезапуске подагента (после NEEDS_USER_INPUT) -- используй тот же worktree path и branch name. Подагент должен проверить, существует ли worktree, и продолжить работу в нём.
6. Не запрашивай подтверждение у пользователя перед запуском подагентов, если план ясен. Действуй автономно.
7. Если пользователь дал всего 1 issue -- пропусти Шаг 2 (анализ пересечений), сразу запусти одного подагента.
