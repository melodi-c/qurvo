---
name: test-env
description: Настройка тестовой среды Shot Analytics — авторизация, получение токена, отправка тестовых событий через SDK
disable-model-invocation: true
---

# Тестовая среда Shot Analytics

Сервисы: API `http://localhost:3000` · Ingest `http://localhost:3001` · Web `http://localhost:5173`

## Быстрый старт

```bash
SCRIPTS=".claude/skills/test-env/scripts"
chmod +x $SCRIPTS/*.sh

# 1. Логин / регистрация + выбор/создание проекта + API ключ
eval $($SCRIPTS/setup.sh)

# 2. Отправить тестовые события
$SCRIPTS/send-events.sh

# 3. Открыть в браузере
open "http://localhost:5173/events?project=$PROJECT_ID"
```

## Скрипты

| Скрипт | Что делает |
|--------|-----------|
| `setup.sh` | Логин (или регистрация), выбор проекта, создание API ключа. Выводит `export`-переменные: `TOKEN`, `PROJECT_ID`, `API_KEY` |
| `send-events.sh` | Отправляет 6 тестовых событий через Ingest (требует `API_KEY` из `setup.sh`) |
| `get-token.sh` | Только логин и вывод токена, если нужен токен отдельно |

## Переменные окружения

```bash
SHOT_EMAIL=test@test.com      # по умолчанию
SHOT_PASSWORD=password123     # по умолчанию
SHOT_NAME="Test User"         # имя при регистрации
```

## Важно: context vs properties

Системные поля (`url`, `browser`, `os` и т.д.) передаются в `context`, не в `properties`:

```json
{
  "event": "button_click",
  "distinct_id": "user-123",
  "context": {
    "url": "https://myapp.com/page",
    "page_path": "/page",
    "browser": "Chrome"
  },
  "properties": {
    "button_name": "upgrade"
  }
}
```
