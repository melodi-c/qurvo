# @qurvo/sdk-node

Server-side SDK for [Qurvo](https://qurvo.ru) analytics. Track events, identify users, and manage user properties from your Node.js backend.

## Installation

```bash
npm install @qurvo/sdk-node
# or
pnpm add @qurvo/sdk-node
# or
yarn add @qurvo/sdk-node
```

## Quick Start

```typescript
import { Qurvo } from '@qurvo/sdk-node';

const qurvo = new Qurvo({
  apiKey: 'qk_your_api_key',
  endpoint: 'https://ingest.yourapp.com',
});

// Track events
qurvo.track({
  distinct_id: 'user-123',
  event: 'purchase',
  properties: { plan: 'premium', amount: 49.99 },
});

// Identify a user
qurvo.identify({
  distinct_id: 'user-123',
  user_properties: { email: 'jane@example.com', name: 'Jane Doe' },
});

// Flush remaining events on shutdown
await qurvo.shutdown();
```

## Configuration

```typescript
const qurvo = new Qurvo({
  apiKey: 'qk_...',          // Required. Your project API key
  endpoint: 'https://...',   // Ingest API URL (default: http://localhost:3001)
  flushInterval: 5000,       // Batch send interval in ms (default: 5000)
  flushSize: 20,             // Send batch when queue reaches this size (default: 20)
  maxQueueSize: 1000,        // Maximum events in queue (default: 1000)
});
```

## API

### `qurvo.track({ distinct_id, event, properties? })`

Track a custom event.

```typescript
qurvo.track({
  distinct_id: 'user-123',
  event: 'file_uploaded',
  properties: {
    file_type: 'pdf',
    file_size_mb: 4.2,
  },
});
```

### `qurvo.identify({ distinct_id, user_properties })`

Identify a user and set their properties. Sends a `$identify` event.

```typescript
qurvo.identify({
  distinct_id: 'user-123',
  user_properties: {
    email: 'jane@example.com',
    name: 'Jane Doe',
    created_at: '2025-01-15',
  },
});
```

### `qurvo.set({ distinct_id, properties })`

Set user properties. Overwrites existing values.

```typescript
qurvo.set({
  distinct_id: 'user-123',
  properties: { plan: 'enterprise', company: 'Acme Inc.' },
});
```

### `qurvo.setOnce({ distinct_id, properties })`

Set user properties only if they haven't been set before.

```typescript
qurvo.setOnce({
  distinct_id: 'user-123',
  properties: { referral_source: 'google', first_seen: new Date().toISOString() },
});
```

### `qurvo.screen({ distinct_id, screen_name, properties? })`

Track a screen view (useful for mobile apps or SSR).

```typescript
qurvo.screen({
  distinct_id: 'user-123',
  screen_name: 'HomeScreen',
  properties: { tab: 'trending' },
});
```

### `await qurvo.shutdown()`

Flush all remaining events and stop the queue. Call this before your process exits to ensure no events are lost.

```typescript
process.on('SIGTERM', async () => {
  await qurvo.shutdown();
  process.exit(0);
});
```

## How It Works

- **Event queue** batches events and sends them every 5 seconds or when the batch reaches 20 events.
- **Retry with backoff** on network failures: 1s, 2s, 4s, 8s... up to 30s between retries.
- **Overflow protection**: when the queue reaches `maxQueueSize`, the oldest events are dropped.
- **Graceful shutdown**: `shutdown()` stops the timer and flushes all remaining events.

## Special Events

| Event | Trigger |
|---|---|
| `$identify` | `identify()` call |
| `$set` | `set()` call |
| `$set_once` | `setOnce()` call |
| `$screen` | `screen()` call |

## Express Example

```typescript
import express from 'express';
import { Qurvo } from '@qurvo/sdk-node';

const app = express();
const qurvo = new Qurvo({
  apiKey: 'qk_your_api_key',
  endpoint: 'https://ingest.yourapp.com',
});

app.post('/api/checkout', (req, res) => {
  const userId = req.user.id;

  qurvo.track({
    distinct_id: userId,
    event: 'checkout_completed',
    properties: { cart_total: req.body.total, items: req.body.items.length },
  });

  res.json({ ok: true });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await qurvo.shutdown();
  process.exit(0);
});

app.listen(3000);
```

## TypeScript

The package ships with full TypeScript type definitions.

```typescript
import { Qurvo, type NodeSdkConfig } from '@qurvo/sdk-node';
```

## License

MIT
