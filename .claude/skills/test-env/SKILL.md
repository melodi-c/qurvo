---
name: test-env
description: Настройка тестовой среды Qurvo — авторизация, получение токена, отправка тестовых событий через SDK
disable-model-invocation: true
---

# Тестовая среда Qurvo

Сервисы: API `http://localhost:3000` · Ingest `http://localhost:3001` · Web `http://localhost:5173`

## Быстрый старт

```bash
SCRIPTS=".claude/skills/test-env/scripts"
chmod +x $SCRIPTS/*.sh

# 1. Логин / регистрация + выбор/создание проекта + API ключ
eval $($SCRIPTS/setup.sh)

# 2. Сформировать JSON и отправить (события передаются через stdin)
echo '<JSON массив событий>' | $SCRIPTS/send-events.sh

# 3. Открыть в браузере
open "http://localhost:5173/events?project=$PROJECT_ID"
```

## Скрипты

| Скрипт | Что делает |
|--------|-----------|
| `setup.sh` | Логин (или регистрация), выбор проекта, создание API ключа. Выводит `export`-переменные: `TOKEN`, `PROJECT_ID`, `API_KEY` |
| `send-events.sh` | Принимает JSON-массив событий через **stdin**, отправляет через Ingest API |
| `get-token.sh` | Только логин и вывод токена, если нужен токен отдельно |

## Переменные окружения

```bash
QURVO_EMAIL=test@test.com      # по умолчанию
QURVO_PASSWORD=password123     # по умолчанию
QURVO_NAME="Test User"         # имя при регистрации
```

## Формат событий

`send-events.sh` читает из stdin JSON-массив объектов `EventPayload`. ИИ должен сформировать нужный набор событий в зависимости от задачи.

### Поддерживаемые типы событий

| event | Назначение | Ключевые поля |
|-------|-----------|---------------|
| `$pageview` | Просмотр страницы | `context.url`, `context.page_path`, `context.page_title` |
| `$pageleave` | Уход со страницы | `context.url`, `context.page_path` |
| `$identify` | Идентификация пользователя | `user_properties` (произвольные свойства) |
| `$set` | Обновление person-свойств | `user_properties.$set: { key: value }` |
| `$set_once` | Однократная установка свойств | `user_properties.$set_once: { key: value }` |
| `$screen` | Просмотр экрана (мобильные) | `properties.$screen_name` |
| *(любое другое)* | Кастомное событие (track) | `properties: { ... }` |

### Структура EventPayload

```json
{
  "event": "$pageview",
  "distinct_id": "user-123",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "properties": {},
  "user_properties": {},
  "context": {
    "url": "https://myapp.com/page",
    "referrer": "https://google.com",
    "page_title": "Page Title",
    "page_path": "/page",
    "session_id": "sess-abc",
    "device_type": "Desktop",
    "browser": "Chrome",
    "browser_version": "121",
    "os": "macOS",
    "os_version": "14.2",
    "screen_width": 1920,
    "screen_height": 1080,
    "language": "ru-RU",
    "timezone": "Europe/Moscow",
    "sdk_name": "@qurvo/sdk-node",
    "sdk_version": "0.0.1"
  }
}
```

### Важно: context vs properties

Системные поля (`url`, `browser`, `os` и т.д.) передаются в `context`, не в `properties`:

```json
{
  "event": "button_click",
  "distinct_id": "user-123",
  "context": { "url": "https://myapp.com/page", "page_path": "/page", "browser": "Chrome" },
  "properties": { "button_name": "upgrade" }
}
```

### Пример: полный тестовый набор

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

cat <<EOF | $SCRIPTS/send-events.sh
[
  {"event":"\$pageview","distinct_id":"user-alice","timestamp":"$NOW","context":{"url":"https://myapp.com/dashboard","page_title":"Dashboard","page_path":"/dashboard","browser":"Chrome","os":"macOS"}},
  {"event":"\$pageleave","distinct_id":"user-alice","timestamp":"$NOW","context":{"url":"https://myapp.com/dashboard","page_path":"/dashboard"}},
  {"event":"\$identify","distinct_id":"user-alice","timestamp":"$NOW","user_properties":{"name":"Alice","email":"alice@example.com"}},
  {"event":"\$set","distinct_id":"user-alice","timestamp":"$NOW","user_properties":{"\$set":{"plan":"pro"}}},
  {"event":"\$set_once","distinct_id":"user-alice","timestamp":"$NOW","user_properties":{"\$set_once":{"first_seen":"$NOW"}}},
  {"event":"\$screen","distinct_id":"user-bob","timestamp":"$NOW","properties":{"\$screen_name":"ProfileScreen"},"context":{"device_type":"Mobile","os":"iOS"}},
  {"event":"button_click","distinct_id":"user-alice","timestamp":"$NOW","properties":{"button":"upgrade"}}
]
EOF
```
