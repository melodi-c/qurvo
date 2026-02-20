# @qurvo/sdk-node

Server-side SDK for Node.js. Wraps `@qurvo/sdk-core`.

## Commands

```bash
pnpm --filter @qurvo/sdk-node build   # tsc → dist/
pnpm --filter @qurvo/sdk-node dev     # tsc --watch
```

## Usage

```typescript
import { Qurvo } from '@qurvo/sdk-node';

const qurvo = new Qurvo({ apiKey: 'sk_...' });
qurvo.track('purchase', 'user-123', { plan: 'premium' });
qurvo.identify('user-123', { email: 'user@example.com' });
await qurvo.shutdown(); // flush remaining events
```

## API

| Method | Description |
|---|---|
| `track(event, distinctId, properties?)` | Track custom event |
| `identify(distinctId, properties?)` | Identify user (sends `$identify`) |
| `set(distinctId, properties)` | Set user properties (sends `$set`) |
| `setOnce(distinctId, properties)` | Set user properties once (sends `$set_once`) |
| `screen(distinctId, screenName, properties?)` | Track screen view |
| `shutdown()` | Flush queue and clean up |

## Config

`NodeSdkConfig` extends `SdkConfig`:
- `apiKey` (required) — API key for authentication
- `endpoint` (optional) — default `http://localhost:3001`

## Structure

```
src/
├── index.ts   # Qurvo class + NodeSdkConfig
```
