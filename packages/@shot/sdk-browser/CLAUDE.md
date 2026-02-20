# @shot/sdk-browser

Browser SDK for client-side event tracking. Wraps `@shot/sdk-core`.

## Commands

```bash
pnpm --filter @shot/sdk-browser build   # tsc → dist/
pnpm --filter @shot/sdk-browser dev     # tsc --watch
```

## Usage

```typescript
import { shot } from '@shot/sdk-browser';

shot.init({ apiKey: 'sk_...', endpoint: 'https://ingest.example.com' });
shot.track('button_click', { button: 'signup' });
shot.identify('user-123');
shot.page(); // manual pageview
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

- **Anonymous ID**: Generated UUID stored in `localStorage`
- **Session ID**: Generated UUID stored in `sessionStorage`
- **Auto-capture**: Tracks `$pageview` on `pushState` and `popstate` events
- **Beacon flush**: Uses `navigator.sendBeacon` on page unload/visibility change
- **Context collection**: `url`, `referrer`, `page_title`, `page_path`, screen dimensions, `language`, `timezone`

## Config

`BrowserSdkConfig`:
- `apiKey` (required)
- `endpoint` (optional) — ingest API URL
- `autoCapture` (optional) — auto-track page navigation

## Structure

```
src/
├── index.ts   # ShotBrowser class + singleton `shot` export
```
