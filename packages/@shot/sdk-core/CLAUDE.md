# @shot/sdk-core

Base SDK transport and event queue. Zero dependencies. Used by `@shot/sdk-browser` and `@shot/sdk-node`.

## Commands

```bash
pnpm --filter @shot/sdk-core build   # tsc → dist/
pnpm --filter @shot/sdk-core dev     # tsc --watch
```

## Exports

```typescript
import { EventQueue, FetchTransport } from '@shot/sdk-core';
import type { SdkConfig, EventPayload, EventContext, Transport, SendOptions } from '@shot/sdk-core';
```

### EventQueue
Buffers events and auto-flushes:
- Flush interval: 5s (configurable)
- Flush size: 20 events (configurable)
- Max queue size: configurable
- Exponential backoff on failure (up to 30s)
- Beacon API support for page unload (`sendBeacon` option)

### FetchTransport
HTTP POST transport using `fetch`. Sends batched events to `/v1/batch`.

### Types
- `SdkConfig` — API key, endpoint, flush settings
- `EventPayload` — event name, distinct_id, properties, timestamp
- `EventContext` — browser/device context (url, referrer, screen, etc.)
- `Transport` — interface for custom transports
- `SendOptions` — `{ useBeacon?: boolean }`

## Structure

```
src/
├── index.ts            # Re-exports
├── types.ts            # All type definitions
├── queue.ts            # EventQueue implementation
└── fetch-transport.ts  # FetchTransport implementation
```
