#!/usr/bin/env bash
# Полная настройка тестовой среды:
# - логин (или регистрация, если пользователь не существует)
# - выбор или создание проекта
# - получение или создание API ключа
# Выводит: PROJECT_ID и API_KEY в формате export-переменных

set -euo pipefail

API="http://localhost:3000"
INGEST="http://localhost:3001"
EMAIL="${QURVO_EMAIL:-test@test.com}"
PASS="${QURVO_PASSWORD:-password123}"
NAME="${QURVO_NAME:-Test User}"

echo "==> Checking API at $API..." >&2

# --- Login ---
LOGIN_RESP=$(curl -sf -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" 2>/dev/null || echo '{}')

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.token // empty')

# --- Register if login failed ---
if [ -z "$TOKEN" ]; then
  echo "==> Login failed, trying registration..." >&2
  REG_RESP=$(curl -sf -X POST "$API/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"$NAME\"}" 2>/dev/null || echo '{}')

  TOKEN=$(echo "$REG_RESP" | jq -r '.token // empty')

  if [ -z "$TOKEN" ]; then
    echo "ERROR: registration also failed. Check that the API is running on $API" >&2
    exit 1
  fi
  echo "==> Registered as $EMAIL" >&2
else
  echo "==> Logged in as $EMAIL" >&2
fi

# --- Get or create project ---
PROJECTS=$(curl -sf "$API/api/projects" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.')

PROJECT_COUNT=$(echo "$PROJECTS" | jq 'length')

if [ "$PROJECT_COUNT" -gt 0 ]; then
  PROJECT_ID=$(echo "$PROJECTS" | jq -r '.[0].id')
  PROJECT_NAME=$(echo "$PROJECTS" | jq -r '.[0].name')
  echo "==> Using existing project: $PROJECT_NAME ($PROJECT_ID)" >&2
else
  echo "==> No projects found, creating 'My App'..." >&2
  NEW_PROJECT=$(curl -sf -X POST "$API/api/projects" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"My App","slug":"my-app"}')
  PROJECT_ID=$(echo "$NEW_PROJECT" | jq -r '.id')
  echo "==> Created project: $PROJECT_ID" >&2
fi

# --- Get or create API key ---
KEYS=$(curl -sf "$API/api/projects/$PROJECT_ID/keys" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.')

KEY_COUNT=$(echo "$KEYS" | jq 'length')

if [ "$KEY_COUNT" -gt 0 ]; then
  # Нельзя получить сам ключ обратно (хранится хэш) — создадим новый
  echo "==> Found $KEY_COUNT existing key(s), creating fresh key for testing..." >&2
fi

NEW_KEY_RESP=$(curl -sf -X POST "$API/api/projects/$PROJECT_ID/keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"test-'$(date +%s)'"}')
API_KEY=$(echo "$NEW_KEY_RESP" | jq -r '.key')

echo "==> API key created" >&2

# --- Output ---
echo "export TOKEN='$TOKEN'"
echo "export PROJECT_ID='$PROJECT_ID'"
echo "export API_KEY='$API_KEY'"
echo "export INGEST='$INGEST'"
