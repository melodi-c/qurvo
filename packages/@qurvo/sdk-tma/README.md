# @qurvo/sdk-tma

Telegram Mini Apps SDK for [Qurvo](https://qurvo.io) analytics.

A thin wrapper around `@qurvo/sdk-core` adapted for the TMA runtime:

- `distinctId` derived from `Telegram.WebApp.initDataUnsafe.user.id` — no anonymous UUID in localStorage
- Queue backed by `Telegram.WebApp.CloudStorage` — events survive app restarts and session gaps
- `session_id` stored in `sessionStorage` (same as the browser SDK)
- Auto-context: `platform`, `start_param`, `is_premium`, `language_code`
- Auto-event `tma_opened` on init; optional `main_button_clicked`, `back_button_pressed`, `invoice_closed`
- Flush triggered on `viewportChanged` (TMA close/collapse) and `visibilitychange`

---

## Installation

```bash
npm install @qurvo/sdk-tma
# or
pnpm add @qurvo/sdk-tma
```

---

## Quick start

```typescript
import { qurvo } from '@qurvo/sdk-tma';

// Call as early as possible, after Telegram.WebApp.ready()
Telegram.WebApp.ready();

qurvo.init({
  apiKey: 'sk_your_api_key',
  endpoint: 'https://ingest.your-domain.com',
});

// Track a custom event
qurvo.track('item_viewed', { item_id: '42', category: 'shoes' });
```

On `init`, the SDK:
1. Reads `Telegram.WebApp.initDataUnsafe.user.id` and uses it as `distinct_id`
2. Loads any previously unsent events from `CloudStorage` and re-queues them
3. Tracks a `tma_opened` event with platform and user context
4. Starts the periodic flush timer (default: every 3 seconds)

---

## Identify

In most cases you do **not** need to call `identify()` — the Telegram user ID is already the `distinct_id`. Call it only when you want to link the Telegram numeric ID to your own internal user ID:

```typescript
// After your backend resolves the Telegram user to your application user
qurvo.identify('your-internal-user-id', {
  email: 'user@example.com',
  plan: 'premium',
});
```

---

## User properties

```typescript
// Set (overwrite) user properties
qurvo.set({ subscription_tier: 'gold', referral_code: 'ABC123' });

// Set only if not already set (first touch attribution)
qurvo.setOnce({ first_seen_start_param: 'summer_promo' });
```

---

## Optional auto-events

```typescript
qurvo.init({
  apiKey: 'sk_...',
  endpoint: 'https://ingest.your-domain.com',
  autoEvents: {
    mainButton: true,     // tracks 'main_button_clicked'
    backButton: true,     // tracks 'back_button_pressed'
    invoiceClosed: true,  // tracks 'invoice_closed' with { url, status }
  },
});
```

`invoice_closed` status values: `'paid'`, `'cancelled'`, `'failed'`, `'pending'`

---

## Automatic context

Every event automatically includes:

| Property | Source | Example |
|---|---|---|
| `platform` | `Telegram.WebApp.platform` | `"ios"`, `"android"`, `"tdesktop"` |
| `tma_start_param` | `initDataUnsafe.start_param` | `"summer_promo"` |
| `tma_is_premium` | `initDataUnsafe.user.is_premium` | `true` |
| `tma_language_code` | `initDataUnsafe.user.language_code` | `"ru"` |
| `session_id` | `sessionStorage` (per session) | UUID |
| `sdk_name` | constant | `"@qurvo/sdk-tma"` |
| `sdk_version` | package version | `"0.0.1"` |

---

## CloudStorage queue

Events are serialised to `Telegram.WebApp.CloudStorage` under the key `qurvo_queue`. On the next app open, the SDK loads and replays any events that were not flushed in the previous session (e.g. due to sudden closure or network failure).

If `CloudStorage` is unavailable (running in a regular browser for development), the SDK falls back gracefully to an in-memory queue with no persistence.

---

## TelegramUser type

```typescript
import type { TelegramUser } from '@qurvo/sdk-tma';

// { id, username?, first_name, last_name?, is_premium?, language_code?, photo_url? }
```

---

## Reset

```typescript
// Clears the current identity and stops the queue (e.g. on logout)
qurvo.reset();
```

After calling `reset()`, call `qurvo.init(config)` again to start a new session.

---

## CDN / IIFE bundle

If you load the SDK via a `<script>` tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@qurvo/sdk-tma/dist/qurvo-tma.iife.js"></script>
<script>
  QurvoTma.init({ apiKey: 'sk_...', endpoint: 'https://ingest.your-domain.com' });
  QurvoTma.track('button_click');
</script>
```

---

## License

MIT
