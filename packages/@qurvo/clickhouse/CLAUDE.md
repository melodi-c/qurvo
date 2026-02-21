# @qurvo/clickhouse

ClickHouse client factory and event type definitions.

## Commands

```bash
pnpm --filter @qurvo/clickhouse build   # tsc → dist/
pnpm --filter @qurvo/clickhouse dev     # tsc --watch
pnpm ch:migrate                        # apply pending ClickHouse migrations
pnpm ch:generate <name>                # create new migration file
```

## Exports

```typescript
import { createClickHouse, type ClickHouseClient, type ClickHouseConfig, type Event } from '@qurvo/clickhouse';
```

- `createClickHouse(config)` — creates `@clickhouse/client` instance
- `ClickHouseClient` — re-exported client type
- `Event` — row type for the `events` table

## Structure

```
src/
├── index.ts        # Exports + Event interface
├── client.ts       # createClickHouse() factory
├── migrate.ts      # Versioned migration runner
├── generate.ts     # Migration file generator
└── migrations/     # SQL migration files (0001_*.sql, 0002_*.sql, ...)
```

## Migrations

Migration files live in `src/migrations/` and are applied in lexicographic order. Applied migrations are tracked in the `_migrations` ClickHouse table.

### Adding a new migration

```bash
pnpm ch:generate add_sessions_table    # creates src/migrations/0002_add_sessions_table.sql
# Edit the generated file with your DDL
pnpm ch:migrate                        # applies only pending migrations
```

### Template variables

Migration files support template substitution:
- `${CLICKHOUSE_DB}` — database name
- `${CLICKHOUSE_USER}` — username
- `${CLICKHOUSE_PASSWORD}` — password

### Statement splitting

Statements are split on `;\n`. End each statement with a semicolon followed by a newline.

## ClickHouse Schema

Defined in `src/migrations/0001_initial_schema.sql`:

| Object | Engine | Purpose |
|---|---|---|
| `events` | `ReplacingMergeTree(ingested_at)` | Event storage. Partitioned by `toYYYYMM(timestamp)`, TTL 365d |
| `person_distinct_id_overrides` | `ReplacingMergeTree(version)` | Anonymous → known person mapping |
| `person_overrides_dict` | Dictionary | Refreshed every 30-60s from overrides table |

## Key Patterns

- Query functions live in consuming apps (`apps/api/src/*/query.ts`), not in this package
- Always use `FROM events FINAL` to deduplicate
- `properties` and `user_properties` are stored as JSON strings
- Person resolution at query time: `dictGetOrNull('qurvo_analytics.person_overrides_dict', 'person_id', (project_id, distinct_id))`
- Schema changes: `pnpm ch:generate <name>` → write SQL → `pnpm ch:migrate`
