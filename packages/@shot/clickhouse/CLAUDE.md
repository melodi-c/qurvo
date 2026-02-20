# @shot/clickhouse

ClickHouse client factory and event type definitions.

## Commands

```bash
pnpm --filter @shot/clickhouse build   # tsc → dist/
pnpm --filter @shot/clickhouse dev     # tsc --watch
pnpm ch:migrate                        # apply migration.sql to ClickHouse
```

## Exports

```typescript
import { createClickHouse, type ClickHouseClient, type ClickHouseConfig, type Event } from '@shot/clickhouse';
```

- `createClickHouse(config)` — creates `@clickhouse/client` instance
- `ClickHouseClient` — re-exported client type
- `Event` — row type for the `events` table

## Structure

```
src/
├── index.ts        # Exports + Event interface
├── client.ts       # createClickHouse() factory
├── migrate.ts      # Migration runner (raw SQL)
└── migration.sql   # Schema: events table, person_distinct_id_overrides, person_overrides_dict
```

## ClickHouse Schema

Defined in `src/migration.sql`:

| Object | Engine | Purpose |
|---|---|---|
| `events` | `ReplacingMergeTree(ingested_at)` | Event storage. Partitioned by `toYYYYMM(timestamp)`, TTL 365d |
| `person_distinct_id_overrides` | `ReplacingMergeTree(version)` | Anonymous → known person mapping |
| `person_overrides_dict` | Dictionary | Refreshed every 30-60s from overrides table |

## Key Patterns

- Query functions live in consuming apps (`apps/api/src/*/query.ts`), not in this package
- Always use `FROM events FINAL` to deduplicate
- `properties` and `user_properties` are stored as JSON strings
- Person resolution at query time: `dictGetOrNull('shot_analytics.person_overrides_dict', 'person_id', (project_id, distinct_id))`
- Schema changes: edit `migration.sql` → `pnpm ch:migrate`
