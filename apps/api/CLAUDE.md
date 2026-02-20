# API App

NestJS REST API for the dashboard. Port 3000.

## Commands

```bash
pnpm --filter @shot/api dev          # watch mode
pnpm --filter @shot/api build        # nest build → dist/
pnpm --filter @shot/api start        # node dist/main.js

# Integration tests (requires infra:up)
pnpm --filter @shot/api test:integration

# Swagger
pnpm swagger:generate                # nest build && generate swagger.json
pnpm generate-api                    # swagger.json → apps/web/src/api/generated/Api.ts
```

## Module Structure

| Module | Purpose | Key exports |
|---|---|---|
| `AppModule` | Root module | Imports all feature modules |
| `DatabaseModule` | @Global infra | `DRIZZLE`, `CLICKHOUSE`, `REDIS` provider tokens |
| `ApiModule` | HTTP infra | Guards, filters, decorators, DTOs |
| `AuthModule` | Auth | Login/register/logout, sessions, `AuthGuard` |
| `ProjectsModule` | Projects CRUD | Project management, members |
| `ApiKeysModule` | API keys CRUD | Key create/revoke for SDK auth |
| `EventsModule` | Event explorer | Paginated event queries from ClickHouse |
| `PersonsModule` | User profiles | Person list, detail, events by person |
| `TrendModule` | Trend analytics | `queryTrend` — time-series aggregation |
| `FunnelModule` | Funnel analytics | `queryFunnel` — multi-step conversion |
| `CohortsModule` | Cohort analytics | `countCohortMembers` — behavioral segmentation |
| `InsightsModule` | Saved insights | CRUD for saved trend/funnel configs |
| `DashboardsModule` | Dashboards | Dashboard + widget CRUD |

## Architecture

```
src/
├── api/           # HTTP infra: guards/, filters/, decorators/, dto/
├── auth/          # AuthService, AuthGuard, session management
├── projects/      # ProjectsService, ProjectsController
├── api-keys/      # ApiKeysService, ApiKeysController
├── events/        # EventsService (ClickHouse queries)
├── persons/       # PersonsService (ClickHouse queries)
├── trend/         # TrendService, trend.query.ts
├── funnel/        # FunnelService, funnel.query.ts
├── cohorts/       # CohortsService, cohorts.query.ts
├── insights/      # InsightsService, InsightsController
├── dashboards/    # DashboardsService, DashboardsController
├── database/      # DatabaseModule (DRIZZLE, CLICKHOUSE, REDIS providers)
├── providers/     # Provider factories
├── throttler/     # RedisThrottlerStorage
├── utils/         # Shared utilities
└── test/          # Integration tests
    ├── setup.ts
    ├── helpers/
    ├── trend/
    ├── funnel/
    └── cohorts/
```

## Key Patterns

### Provider Injection
Infrastructure injected via custom tokens, not autowiring:
```typescript
constructor(
  @Inject(DRIZZLE) private db: Database,
  @Inject(CLICKHOUSE) private ch: ClickHouseClient,
  @Inject(REDIS) private redis: Redis,
) {}
```

### Exception Layering
- Services throw plain domain exceptions (extend `Error`), never `HttpException`
- Each module owns its exceptions in `{module}/exceptions/`
- Controllers/filters map domain exceptions to HTTP responses
- All `ExceptionFilter` implementations live in `src/api/filters/`

### Auth Flow
1. Login/register → create session → return opaque bearer token
2. `AuthGuard` validates `Authorization: Bearer <token>` on every request
3. Session tokens stored as SHA-256 hashes in PostgreSQL, cached in Redis (60s TTL)

### Analytics Queries
Query functions live in `src/{module}/{module}.query.ts`, not in `@shot/clickhouse`:
- `queryTrend(ch, params)` — time-series with granularity, compare, breakdown, cohort filters
- `queryFunnel(ch, params)` — multi-step conversion with window, breakdown, cohort filters
- `countCohortMembers(ch, projectId, definition)` — behavioral cohort counting
- All queries use `FROM events FINAL` to deduplicate ReplacingMergeTree

### Filter Registration
Filters registered via `APP_FILTER` provider in their module, never via `app.useGlobalFilters()`:
```typescript
{ provide: APP_FILTER, useClass: SomeExceptionFilter }
```

## Integration Tests

Tests in `src/test/{module}/`. Run with `vitest.integration.config.ts`.

- Use `setupContainers()` from `@shot/testing` for PostgreSQL + Redis + ClickHouse
- Date helpers (`daysAgo`, `ts`, `msAgo`, `dateOffset`) from `@shot/testing`
- API-specific `sumSeriesValues()` in `src/test/helpers/`
- 21 tests: trends (7), funnels (5), cohorts (9)
