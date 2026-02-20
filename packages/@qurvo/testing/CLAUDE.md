# @qurvo/testing

Test infrastructure with testcontainers. Used directly as TypeScript source (no build step).

## Usage

```typescript
import {
  setupContainers, teardownContainers,
  insertTestEvents, buildEvent, createTestProject,
  waitForClickHouseCount, waitForRedisStreamLength,
  DAY_MS, daysAgo, dateOffset, ts, msAgo,
} from '@qurvo/testing';
```

## Exports

### Container Lifecycle

| Function | Description |
|---|---|
| `setupContainers()` | Spins up PostgreSQL 17, Redis 7, ClickHouse 24.8. Singleton — cached across tests |
| `teardownContainers()` | Stops all containers. Call in globalSetup teardown or afterAll |

`ContainerContext` provides: `db`, `ch`, `redis`, `pgUrl`, `redisUrl`, `clickhouseUrl`, `clickhouseDb`, `clickhouseUser`, `clickhousePassword`

### Factories

| Function | Description |
|---|---|
| `buildEvent(overrides)` | Creates a full `Event` object with sensible defaults |
| `insertTestEvents(ch, events)` | Inserts events into ClickHouse with `async_insert: 0` (synchronous) |
| `createTestProject(db)` | Creates a user + project + API key in PostgreSQL. Returns `{ projectId, apiKey }` |

### Wait Helpers

| Function | Description |
|---|---|
| `waitForClickHouseCount(ch, projectId, expected, opts?)` | Polls until event count matches |
| `waitForRedisStreamLength(redis, stream, expected, opts?)` | Polls until stream length matches |

### Date Helpers

| Function | Returns | Example |
|---|---|---|
| `daysAgo(n)` | `YYYY-MM-DD` | `daysAgo(3)` → 3 days ago |
| `dateOffset(days)` | `YYYY-MM-DD` | `dateOffset(-1)` → yesterday |
| `ts(daysBack, hour?)` | ISO timestamp | `ts(3, 12)` → noon 3 days ago |
| `msAgo(ms)` | ISO timestamp | `msAgo(3000)` → 3s ago |
| `DAY_MS` | `86_400_000` | Milliseconds in a day |

## Structure

```
src/
├── index.ts              # Re-exports everything
├── containers.ts         # Testcontainers setup (singleton)
├── factories.ts          # buildEvent, insertTestEvents, createTestProject
├── wait.ts               # Polling wait helpers
├── date-helpers.ts       # Date utility functions
├── migrate-postgres.ts   # Test PostgreSQL migration
└── migrate-clickhouse.ts # Test ClickHouse migration
```

## Key Patterns

- **No build step**: `"main": "src/index.ts"` — vitest resolves TypeScript directly
- **Singleton containers**: `setupContainers()` caches promise, safe to call from multiple test files
- **Recent timestamps required**: ClickHouse `events` table has `TTL 365 DAY`. Always use relative dates (`daysAgo`, `ts`, `msAgo`), never hardcoded past dates
- **Synchronous inserts**: `insertTestEvents` uses `async_insert: 0` to ensure data is queryable immediately
- **Cohort tests**: `argMax(user_properties, timestamp)` picks latest event — set `user_properties` on ALL test events, not just the first
