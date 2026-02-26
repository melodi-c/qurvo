# @qurvo/db

PostgreSQL schema and client via Drizzle ORM.

## Commands

```bash
pnpm --filter @qurvo/db build         # tsc → dist/
pnpm --filter @qurvo/db dev           # tsc --watch
pnpm --filter @qurvo/db db:generate   # drizzle-kit generate (SQL migrations)
pnpm --filter @qurvo/db db:migrate    # tsx src/migrate.ts (apply migrations)
```

## Exports

```typescript
import { createDb, type Database } from '@qurvo/db';
import { users, sessions, projects, ... } from '@qurvo/db';
```

- `createDb(databaseUrl)` — creates Drizzle client with `postgres` driver
- `Database` — Drizzle instance type
- Schema tables — all re-exported from `src/index.ts`

## Schema Tables

| Table | File | Purpose |
|---|---|---|
| `users` | `schema/users.ts` | User accounts (email, password hash) |
| `sessions` | `schema/sessions.ts` | Bearer token sessions (SHA-256 hash) |
| `projects` | `schema/projects.ts` | Analytics projects (includes `token` field for SDK auth) |
| `project_members` | `schema/project-members.ts` | Project membership |
| `persons` | `schema/persons.ts` | Resolved person entities |
| `person_distinct_ids` | `schema/person-distinct-ids.ts` | Distinct ID → person mapping |
| `cohorts` | `schema/cohorts.ts` | Saved cohort definitions |
| `dashboards` | `schema/dashboards.ts` | Dashboard metadata |
| `insights` | `schema/insights.ts` | Saved trend/funnel insights |
| `widgets` | `schema/widgets.ts` | Dashboard widgets |

## Structure

```
src/
├── index.ts          # Re-exports client + all schema
├── client.ts         # createDb() factory
├── migrate.ts        # Migration runner
└── schema/           # Drizzle table definitions
drizzle/              # Generated SQL migrations (auto-generated)
drizzle.config.ts     # Drizzle Kit config
```

## Key Patterns

- Schema changes: edit `src/schema/*.ts` → `pnpm --filter @qurvo/db db:generate` → commit generated SQL
- All tables use `uuid` primary keys with `defaultRandom()`
- Timestamps: `created_at` (default now), `updated_at` (default now)
- Consumers inject via `@Inject(DRIZZLE)` token from `DatabaseModule`
