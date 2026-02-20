# @shot/sdk-node

Server-side SDK for Node.js. Wraps `@shot/sdk-core`.

## Commands

```bash
pnpm --filter @shot/sdk-node build   # tsc → dist/
pnpm --filter @shot/sdk-node dev     # tsc --watch
```

## Usage

```typescript
import { Shot } from '@shot/sdk-node';

const shot = new Shot({ apiKey: 'sk_...' });
shot.track('purchase', 'user-123', { plan: 'premium' });
shot.identify('user-123', { email: 'user@example.com' });
await shot.shutdown(); // flush remaining events
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
├── index.ts   # Shot class + NodeSdkConfig
```
