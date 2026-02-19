#!/usr/bin/env bash
# Отправка набора тестовых событий через Ingest API.
# Требует переменных: API_KEY, PROJECT_ID, INGEST (из setup.sh)
# Использование: eval $(./setup.sh) && ./send-events.sh

set -euo pipefail

: "${API_KEY:?Run setup.sh first: eval \$(./setup.sh)}"
: "${INGEST:=http://localhost:3001}"

NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

echo "==> Sending test events to $INGEST..." >&2

RESP=$(curl -sf -X POST "$INGEST/v1/batch" \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $API_KEY" \
  -d "{
    \"events\": [
      {
        \"event\": \"\$pageview\",
        \"distinct_id\": \"user-alice\",
        \"timestamp\": \"$NOW\",
        \"context\": {
          \"url\": \"https://myapp.com/dashboard\",
          \"referrer\": \"https://google.com\",
          \"page_title\": \"Dashboard\",
          \"page_path\": \"/dashboard\",
          \"device_type\": \"Desktop\",
          \"browser\": \"Chrome\",
          \"browser_version\": \"121\",
          \"os\": \"macOS\",
          \"os_version\": \"14.2\",
          \"screen_width\": 1920,
          \"screen_height\": 1080,
          \"language\": \"ru-RU\",
          \"timezone\": \"Europe/Moscow\",
          \"sdk_name\": \"@shot/sdk-node\",
          \"sdk_version\": \"0.0.1\"
        }
      },
      {
        \"event\": \"\$pageview\",
        \"distinct_id\": \"user-alice\",
        \"timestamp\": \"$NOW\",
        \"context\": {
          \"url\": \"https://myapp.com/settings\",
          \"page_title\": \"Settings\",
          \"page_path\": \"/settings\",
          \"device_type\": \"Desktop\",
          \"browser\": \"Chrome\",
          \"browser_version\": \"121\",
          \"os\": \"macOS\",
          \"language\": \"ru-RU\",
          \"timezone\": \"Europe/Moscow\"
        }
      },
      {
        \"event\": \"button_click\",
        \"distinct_id\": \"user-alice\",
        \"timestamp\": \"$NOW\",
        \"properties\": { \"button_name\": \"upgrade_plan\", \"plan\": \"pro\" },
        \"context\": {
          \"url\": \"https://myapp.com/settings\",
          \"page_path\": \"/settings\"
        }
      },
      {
        \"event\": \"\$identify\",
        \"distinct_id\": \"user-alice\",
        \"timestamp\": \"$NOW\",
        \"user_properties\": {
          \"name\": \"Alice Smith\",
          \"email\": \"alice@example.com\",
          \"plan\": \"pro\"
        }
      },
      {
        \"event\": \"\$pageview\",
        \"distinct_id\": \"user-bob\",
        \"timestamp\": \"$NOW\",
        \"context\": {
          \"url\": \"https://myapp.com/\",
          \"page_title\": \"Home\",
          \"page_path\": \"/\",
          \"device_type\": \"Mobile\",
          \"browser\": \"Safari\",
          \"browser_version\": \"17\",
          \"os\": \"iOS\",
          \"os_version\": \"17.1\",
          \"screen_width\": 390,
          \"screen_height\": 844,
          \"language\": \"en-US\",
          \"timezone\": \"America/Los_Angeles\"
        }
      },
      {
        \"event\": \"signup\",
        \"distinct_id\": \"user-bob\",
        \"timestamp\": \"$NOW\",
        \"properties\": { \"method\": \"google\", \"source\": \"landing_page\" },
        \"context\": {
          \"url\": \"https://myapp.com/signup\",
          \"page_path\": \"/signup\"
        }
      }
    ]
  }")

COUNT=$(echo "$RESP" | jq -r '.count // 0')
echo "==> Sent $COUNT events. Waiting for processor (~7s)..." >&2
sleep 7
echo "==> Done. Open: http://localhost:5173/events?project=${PROJECT_ID}" >&2
