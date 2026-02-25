# @qurvo/sdk-browser

Browser SDK for client-side event tracking. Wraps `@qurvo/sdk-core`.

## Commands

```bash
pnpm --filter @qurvo/sdk-browser build   # tsc → dist/
pnpm --filter @qurvo/sdk-browser dev     # tsc --watch
```

## Usage

```typescript
import { qurvo } from '@qurvo/sdk-browser';

// Regular website — anonymous until identify()
qurvo.init({ apiKey: 'sk_...', endpoint: 'https://ingest.example.com' });

// Telegram Mini App — pass distinctId upfront to namespace storage per user
qurvo.init({ apiKey: 'sk_...', endpoint: '...', distinctId: telegramUserId });

qurvo.track('button_click', { button: 'signup' });
qurvo.identify('user-123');
qurvo.page(); // manual pageview
```

## API

| Method | Description |
|---|---|
| `init(config)` | Initialize SDK. Optionally auto-captures pageviews |
| `track(event, properties?)` | Track custom event |
| `identify(userId)` | Link anonymous user to known user (sends `$identify`) |
| `page(properties?)` | Track pageview |
| `set(properties)` | Set user properties |
| `setOnce(properties)` | Set user properties (only if not already set) |
| `reset()` | Clear identity and stored IDs |

## Browser-Specific Features

- **Anonymous ID**: Generated UUID stored in `localStorage` (always per-device, never namespaced — links pre-identify events to identified users)
- **Session ID**: Generated UUID stored in `sessionStorage`
- **Auto-capture**: Tracks `$pageview` on `pushState`, `popstate`, `hashchange` events
- **Beacon flush**: Uses `keepalive: true` on `pagehide`/`visibilitychange` (more reliable than `beforeunload` in mobile webviews like Telegram, TikTok)
- **Persistent queue**: Events backed to `localStorage` via `QueuePersistence`. Restored on next SDK init. 24h TTL — stale events are dropped on load.
- **Per-user queue namespace**: When `distinctId` is passed, queue key is `qurvo_queue:{userId}` to avoid mixing events across accounts on shared devices (Telegram WebView)
- **In-flight batch recovery**: On page unload, events currently being sent (in-flight) are re-included in the beacon flush
- **Context collection**: `url`, `referrer`, `page_title`, `page_path`, screen dimensions, `language`, `timezone`

## Config

`BrowserSdkConfig`:
- `apiKey` (required)
- `endpoint` (optional) — ingest API URL
- `distinctId` (optional) — known user ID upfront (e.g. Telegram Mini App). Namespaces localStorage queue key per user
- `autocapture` (optional, default `true`) — auto-track page navigation
- `flushInterval` (optional, default `3000`) — ms between auto-flushes
- `flushSize` (optional, default `10`) — events per batch

## Structure

```
src/
├── index.ts   # QurvoBrowser class + singleton `qurvo` export
```
