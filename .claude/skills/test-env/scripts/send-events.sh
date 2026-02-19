#!/usr/bin/env bash
# Отправка событий через Ingest API.
# Принимает JSON-массив событий через stdin.
# Требует переменных: API_KEY, INGEST (из setup.sh)
#
# Использование:
#   eval $(./setup.sh)
#   echo '[{"event":"$pageview","distinct_id":"u1"}]' | ./send-events.sh

set -euo pipefail

: "${API_KEY:?Run setup.sh first: eval \$(./setup.sh)}"
: "${INGEST:=http://localhost:3001}"

EVENTS_JSON=$(cat)

if [ -z "$EVENTS_JSON" ]; then
  echo "ERROR: no events provided on stdin" >&2
  exit 1
fi

echo "==> Sending events to $INGEST..." >&2

RESP=$(curl -sf -X POST "$INGEST/v1/batch" \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d "{\"events\": $EVENTS_JSON}")

COUNT=$(echo "$RESP" | jq -r '.count // 0')
echo "==> Sent $COUNT events. Waiting for processor (~7s)..." >&2
sleep 7
echo "==> Done. Open: http://localhost:5173/events?project=${PROJECT_ID:-unknown}" >&2
