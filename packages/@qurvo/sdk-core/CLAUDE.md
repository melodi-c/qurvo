# @qurvo/sdk-core

Base SDK transport and event queue. Zero dependencies. Used by `@qurvo/sdk-browser` and `@qurvo/sdk-node`.

## Commands

```bash
pnpm --filter @qurvo/sdk-core build   # tsc → dist/
pnpm --filter @qurvo/sdk-core dev     # tsc --watch
```

## Exports

```typescript
import { EventQueue, FetchTransport } from '@qurvo/sdk-core';
import type { SdkConfig, EventPayload, EventContext, Transport, SendOptions } from '@qurvo/sdk-core';
```

### EventQueue
Buffers events and auto-flushes:
- Flush interval: 5s (configurable, sdk-browser uses 3s)
- Flush size: 20 events (configurable)
- Max queue size: configurable
- Exponential backoff on failure (up to 30s)
- Beacon API support for page unload (`flushForUnload`)
- **In-flight batch tracking**: events in-flight are preserved for unload recovery (prevents race condition where flush is in-progress when page closes)
- **Optional persistence**: `QueuePersistence` interface allows backing queue to localStorage/etc. Events are restored on construction, persisted on enqueue/flush

### FetchTransport
HTTP POST transport using `fetch`. Sends batched events to `/v1/batch`.

### Error Classification
- **5xx / network errors** → re-queue batch + exponential backoff (retryable)
- **4xx** → `NonRetryableError` → drop batch (bad data/auth, retrying won't help)
- **429 + `quota_limited`** → `QuotaExceededError` → clear entire queue + stop timer (permanent)

### Types
- `SdkConfig` — API key, endpoint, flush settings
- `EventPayload` — event name, distinct_id, properties, timestamp
- `EventContext` — browser/device context (url, referrer, screen, etc.)
- `Transport` — interface for custom transports
- `SendOptions` — `{ keepalive?: boolean; signal?: AbortSignal }`
- `QueuePersistence` — `{ save(events): void; load(): unknown[] }` for backing queue to storage
- `QuotaExceededError` — thrown on 429 with `quota_limited`, stops queue permanently
- `NonRetryableError` — thrown on 4xx, drops batch without retry

## Structure

```
src/
├── index.ts            # Re-exports
├── types.ts            # All type definitions
├── queue.ts            # EventQueue implementation
└── fetch-transport.ts  # FetchTransport implementation
```
