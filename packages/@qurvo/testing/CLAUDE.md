# @qurvo/testing

Test infrastructure with testcontainers. Used directly as TypeScript source (no build step).

## Usage

```typescript
import {
  setupContainers, teardownContainers,
  createGlobalSetup,
  insertTestEvents, buildEvent, createTestProject,
  waitForClickHouseCount, waitForRedisStreamLength,
  DAY_MS, daysAgo, dateOffset, ts, msAgo,
} from '@qurvo/testing';
```

## Architecture: Shared Containers + Per-Worker Databases

```
globalSetup (main process)
  └─ startGlobalContainers() → 3 containers (PG, Redis, CH)
  └─ writes coordinates to process.env.TEST_*
       ↓
vitest forks (maxForks: 4)
  └─ setupContainers() detects TEST_PG_HOST → setupWorkerContext()
       ├─ PG:    CREATE DATABASE qurvo_worker_N + Drizzle migrations
       ├─ CH:    CREATE DATABASE qurvo_worker_N + SQL migrations
       └─ Redis: SELECT N (db = VITEST_POOL_ID) + FLUSHDB
```

Each fork gets isolated PG database, CH database, and Redis database. One set of containers per app run, not per fork.

### globalSetup in each app

```typescript
// apps/{api,processor,ingest}/src/test/setup.ts
import { createGlobalSetup } from '@qurvo/testing';
const { setup, teardown } = createGlobalSetup();
export { setup, teardown };
```

### Legacy mode

If `TEST_PG_HOST` is not set (e.g., running a single test file without globalSetup), `setupContainers()` falls back to legacy mode — starts its own containers as before.

## Exports

### Container Lifecycle

| Function | Description |
|---|---|
| `createGlobalSetup()` | Factory for vitest globalSetup. Returns `{ setup, teardown }` that start/stop shared containers |
| `setupContainers()` | Shim: delegates to `setupWorkerContext()` if shared infra is running, otherwise starts own containers (legacy) |
| `teardownContainers()` | Shim: closes worker clients or stops legacy containers |
| `startGlobalContainers()` | Starts 3 Docker containers, returns `ContainerCoords` |
| `stopGlobalContainers()` | Stops shared containers |
| `setupWorkerContext()` | Per-worker: creates databases, applies migrations, returns `ContainerContext` |
| `teardownWorkerContext()` | Closes worker clients (does NOT stop containers) |

`ContainerContext` provides: `db`, `ch`, `redis`, `pgUrl`, `redisUrl`, `clickhouseUrl`, `clickhouseDb`, `clickhouseUser`, `clickhousePassword`

`ContainerCoords` provides: `pgHost`, `pgPort`, `pgUser`, `pgPassword`, `redisHost`, `redisPort`, `chHost`, `chPort`, `chUser`, `chPassword`

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
├── containers.ts         # Shim: delegates to worker-context or legacy
├── global-containers.ts  # Start/stop Docker containers (no databases)
├── worker-context.ts     # Per-worker database creation + client setup
├── vitest-global-setup.ts # createGlobalSetup() factory
├── factories.ts          # buildEvent, insertTestEvents, createTestProject
├── wait.ts               # Polling wait helpers
├── date-helpers.ts       # Date utility functions
├── migrate-postgres.ts   # Drizzle migration runner
└── migrate-clickhouse.ts # ClickHouse SQL migration runner
```

## Key Patterns

- **No build step**: `"main": "src/index.ts"` — vitest resolves TypeScript directly
- **Shared containers**: `createGlobalSetup()` starts 3 containers once in the main process; forks inherit coordinates via `process.env.TEST_*`
- **Per-worker isolation**: each fork creates `qurvo_worker_N` databases (PG + CH) and uses Redis DB N
- **maxForks: 4**: up to 4 parallel forks per app. Redis has 16 DBs (0-15), so max 15 workers
- **Recent timestamps required**: ClickHouse `events` table has `TTL 365 DAY`. Always use relative dates (`daysAgo`, `ts`, `msAgo`), never hardcoded past dates
- **Synchronous inserts**: `insertTestEvents` uses `async_insert: 0` to ensure data is queryable immediately
- **Cohort tests**: `argMax(user_properties, timestamp)` picks latest event — set `user_properties` on ALL test events, not just the first
