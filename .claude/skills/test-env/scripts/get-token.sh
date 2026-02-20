#!/usr/bin/env bash
# Логин и вывод Bearer токена
# Использование: source get-token.sh  или  TOKEN=$(./get-token.sh)

API="http://localhost:3000"
EMAIL="${QURVO_EMAIL:-test@test.com}"
PASS="${QURVO_PASSWORD:-password123}"

TOKEN=$(curl -sf -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: login failed (is API running on $API?)" >&2
  exit 1
fi

echo "$TOKEN"
