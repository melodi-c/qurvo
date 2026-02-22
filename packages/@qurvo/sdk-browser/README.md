# @qurvo/sdk-browser

Browser SDK for [Qurvo](https://qurvo.ru) analytics. Lightweight client-side event tracking with automatic pageview capture, user identification, and reliable event delivery.

## Installation

```bash
npm install @qurvo/sdk-browser
# or
pnpm add @qurvo/sdk-browser
# or
yarn add @qurvo/sdk-browser
```

## CDN / Script Tag

Load the SDK directly via a `<script>` tag — no bundler required:

```html
<script src="https://unpkg.com/@qurvo/sdk-browser@latest/dist/qurvo.iife.js"></script>
<script>
  qurvo.init({
    apiKey: 'qk_your_api_key',
    endpoint: 'https://ingest.yourapp.com',
  });
</script>
```

Pin a specific version for production:

```html
<!-- unpkg -->
<script src="https://unpkg.com/@qurvo/sdk-browser@0.0.9/dist/qurvo.iife.js"></script>

<!-- jsdelivr -->
<script src="https://cdn.jsdelivr.net/npm/@qurvo/sdk-browser@0.0.9/dist/qurvo.iife.js"></script>
```

The IIFE build exposes a global `qurvo` object with the same API as the ES module.

## Quick Start

```typescript
import { qurvo } from '@qurvo/sdk-browser';

// Initialize with your project API key
qurvo.init({
  apiKey: 'qk_your_api_key',
  endpoint: 'https://ingest.yourapp.com',
});

// Track custom events
qurvo.track('button_click', { button: 'signup', page: '/pricing' });

// Identify a user after login
qurvo.identify('user-123', { email: 'jane@example.com', plan: 'pro' });
```

That's it. The SDK automatically tracks pageviews, collects browser context, and batches events for efficient delivery.

## Configuration

```typescript
qurvo.init({
  apiKey: 'qk_...',          // Required. Your project API key
  endpoint: 'https://...',   // Ingest API URL (default: http://localhost:3001)
  autocapture: true,         // Auto-track page navigation (default: true)
  flushInterval: 10000,      // Batch send interval in ms (default: 10000)
  flushSize: 10,             // Send batch when queue reaches this size (default: 10)
});
```

## API

### `qurvo.init(config)`

Initializes the SDK. Must be called before any other method. Safe to call multiple times (subsequent calls are ignored).

When `autocapture` is enabled (default), the SDK automatically:
- Tracks an initial `$pageview` event
- Monitors `history.pushState` and `popstate` for SPA navigation
- Sends a `$pageleave` event and flushes the queue on page unload

### `qurvo.track(event, properties?)`

Track a custom event.

```typescript
qurvo.track('purchase', {
  product_id: 'prod_123',
  amount: 49.99,
  currency: 'USD',
});
```

### `qurvo.identify(userId, userProperties?)`

Link the current anonymous user to a known user ID. Sends a `$identify` event that merges the anonymous session history with the identified user.

```typescript
qurvo.identify('user-123', {
  email: 'jane@example.com',
  name: 'Jane Doe',
  plan: 'pro',
});
```

### `qurvo.page(properties?)`

Manually track a pageview. Called automatically on initialization and SPA navigation when `autocapture` is enabled.

```typescript
qurvo.page({ section: 'docs' });
```

### `qurvo.set(properties)`

Set user properties. Overwrites existing values.

```typescript
qurvo.set({ plan: 'enterprise', company: 'Acme Inc.' });
```

### `qurvo.setOnce(properties)`

Set user properties only if they haven't been set before. Useful for first-touch attribution.

```typescript
qurvo.setOnce({ referral_source: 'google', first_seen: new Date().toISOString() });
```

### `qurvo.reset()`

Clear the current user identity and all stored IDs. Call this on logout.

```typescript
qurvo.reset();
```

## Automatic Context

Every event includes browser context collected automatically:

| Field | Example |
|---|---|
| `session_id` | `a1b2c3d4-...` (unique per tab) |
| `url` | `https://app.example.com/dashboard` |
| `referrer` | `https://google.com` |
| `page_title` | `Dashboard - My App` |
| `page_path` | `/dashboard` |
| `screen_width` | `1920` |
| `screen_height` | `1080` |
| `language` | `en-US` |
| `timezone` | `America/New_York` |

## How It Works

- **Anonymous ID** is generated on first visit and persisted in `localStorage`, so the same user is recognized across sessions.
- **Session ID** is stored in `sessionStorage`, giving each tab its own session that ends when the tab closes.
- **Event queue** batches events and sends them every 10 seconds or when the batch reaches 10 events.
- **Page unload** triggers a final flush using `keepalive` fetch to ensure no events are lost.
- **Retry with backoff** on network failures: 1s, 2s, 4s, 8s... up to 30s between retries.

## Special Events

| Event | Trigger |
|---|---|
| `$pageview` | `init()`, SPA navigation (`pushState`, `popstate`) |
| `$pageleave` | Page visibility change (hidden) or `beforeunload` |
| `$identify` | `identify()` call |
| `$set` | `set()` call |
| `$set_once` | `setOnce()` call |

## TypeScript

The package ships with full TypeScript type definitions.

```typescript
import { qurvo, type BrowserSdkConfig } from '@qurvo/sdk-browser';
```

## License

MIT
