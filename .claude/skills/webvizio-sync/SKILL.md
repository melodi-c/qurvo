---
name: webvizio-sync
description: "Импорт задач из Webvizio в GitHub issues через MCP. Обогащает данные (скриншоты, repro steps, console/network/error logs), создаёт GitHub issues с полным контекстом."
disable-model-invocation: true
---

# Webvizio Sync — Импорт задач в GitHub Issues

Ты — оркестратор импорта задач из Webvizio в GitHub issues. Получаешь задачи через Webvizio MCP, обогащаешь данные через подагентов, создаёшь GitHub issues с полным контекстом.

Вызов:
```
/webvizio-sync                     — импортировать все задачи
/webvizio-sync 34,36               — конкретные задачи по номерам
/webvizio-sync --project <uuid>    — сменить Webvizio проект
```

---

## АБСОЛЮТНЫЙ ЗАПРЕТ

Ты — ТОЛЬКО оркестратор. ЗАПРЕЩЕНО:
- Использовать Edit, Write для файлов проекта
- Читать исходный код (Read для .ts/.tsx/.js и т.д.)
- Запускать тесты/build напрямую

Единственные файлы, которые ты читаешь:
- `/tmp/claude-results/webvizio-*.json` (результаты enricher-агентов)
- `.claude/skills/webvizio-sync/SKILL.md`

---

## Шаг 1: Получить задачи из Webvizio

### 1.1 Проверить проект

Если указан `--project <uuid>`:
```
Вызови MCP: set_project(uuid)
```

Иначе:
```
Вызови MCP: get_current_project()
```

Если проект не выбран — спроси пользователя:
```
Вызови MCP: get_projects()
```
Покажи список и попроси выбрать.

### 1.2 Получить задачи

```
Вызови MCP: get_tasks()
```

Результат: список задач с uuid, number, title.

### 1.3 Фильтрация

Если пользователь указал номера (например `34,36`):
- Оставь только задачи с этими номерами
- Если какой-то номер не найден — предупреди

### 1.4 Проверка дубликатов

Получи существующие GitHub issues:
```bash
gh issue list --state open --json number,title,body --limit 200 --jq '.[] | select(.body | contains("<!-- WEBVIZIO:")) | .body' | grep -oE '<!-- WEBVIZIO: [a-f0-9-]+' | sed 's/<!-- WEBVIZIO: //'
```

Исключи задачи, UUID которых уже есть в GitHub issues.

### 1.5 Результат шага

Если задач 0 после фильтрации — сообщи:
```
Все задачи из Webvizio уже импортированы в GitHub issues.
```
И останови выполнение.

---

## Шаг 2: Обогащение через агентов

Подготовь директорию:
```bash
mkdir -p /tmp/claude-results
```

Запусти `webvizio-enricher` **параллельно** (background) для каждой задачи:

```
subagent_type: "webvizio-enricher"
model: haiku
run_in_background: true
prompt: |
  WEBVIZIO_UUID: <uuid>
  WEBVIZIO_NUMBER: <number>
  WEBVIZIO_TITLE: <title>
  RESULT_FILE: /tmp/claude-results/webvizio-<number>.json
```

Дождись завершения ВСЕХ агентов.

Прочитай каждый `/tmp/claude-results/webvizio-<number>.json`:
- `"status": "OK"` → включи в preview
- `"status": "ERROR"` → сообщи об ошибке, исключи из импорта

---

## Шаг 3: Preview

Покажи пользователю превью ВСЕХ задач:

```
── 1 ──────────────────────────────────────────
WV#<number> → <github_title>
Labels: <github_labels через запятую>
Описание: <description_preview>
Repro: <action_count> действий | Console: <да/нет> | Errors: <да/нет>
── 2 ──────────────────────────────────────────
WV#<number> → <github_title>
Labels: <github_labels через запятую>
Описание: <description_preview>
Repro: <action_count> действий | Console: <да/нет> | Errors: <да/нет>
────────────────────────────────────────────────
```

Спроси пользователя через AskUserQuestion:
```
Создать N issues в GitHub?
Варианты: Да / Нет
```

При отказе — останови.

---

## Шаг 4: Создание GitHub issues

Создавай issues **последовательно** (чтобы номера шли по порядку).

Для каждой задачи:

```bash
gh issue create \
  --title "<github_title>" \
  --body "<github_body>" \
  --label "<label1>" --label "<label2>" --label "<label3>"
```

**Важно**: body может быть длинным — используй heredoc:
```bash
gh issue create --title "<title>" --label "bug" --label "web" --label "size:s" --body "$(cat <<'ISSUE_BODY'
<github_body>
ISSUE_BODY
)"
```

Перед созданием проверь что лейблы существуют:
```bash
for label in bug web "size:xs" "size:s" "size:m"; do
  gh label list --json name --jq '.[].name' | grep -q "^${label}$" \
    || gh label create "$label" --color "ededed" 2>/dev/null || true
done
```

Сохрани маппинг: WV_NUMBER → GH_NUMBER.

---

## Шаг 5: Итоговый отчёт

```
=== Создано N issues из Webvizio ===

WV#<wv_number> → GH#<gh_number> — <github_title>
WV#<wv_number> → GH#<gh_number> — <github_title>

Для выполнения: /issue-executor --numbers <gh_numbers через запятую>
```

Очисти временные файлы:
```bash
rm -f /tmp/claude-results/webvizio-*.json
```

---

## Обработка ошибок

- **MCP недоступен** → сообщи пользователю, предложи проверить подключение Webvizio MCP server
- **Задача не найдена** → предупреди, продолжи с остальными
- **gh cli ошибка** → покажи ошибку, предложи проверить `gh auth status`
- **enricher вернул ERROR** → покажи детали ошибки, предложи повторить для конкретной задачи

---

## Критические правила

1. Ты — ТОЛЬКО оркестратор. Не модифицируй файлы проекта.
2. Всегда проверяй дубликаты перед импортом (по `<!-- WEBVIZIO: uuid -->`).
3. Всегда показывай preview перед созданием issues.
4. HTML-комментарий `<!-- WEBVIZIO: uuid -->` ОБЯЗАТЕЛЕН в каждом issue body.
5. Обогащение через `webvizio-enricher` агентов — не самостоятельно.
6. Лейблы создавай если не существуют.
7. Issues создавай последовательно для предсказуемой нумерации.
