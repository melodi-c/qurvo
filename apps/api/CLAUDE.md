# API App

NestJS REST API for the dashboard. Port 3000.

## Commands

```bash
pnpm --filter @qurvo/api dev          # watch mode
pnpm --filter @qurvo/api build        # nest build → dist/
pnpm --filter @qurvo/api start        # node dist/main.js

# Integration tests (requires infra:up)
pnpm --filter @qurvo/api test:integration

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
| `AnalyticsModule` | Analytics queries | Factory-based providers for Trend, Funnel, Retention, Lifecycle, Stickiness, Paths |
| `CohortsModule` | Cohort analytics | `countCohortMembers` — behavioral segmentation |
| `SavedInsightsModule` | Saved insights | CRUD for saved trend/funnel/retention/etc. configs |
| `DashboardsModule` | Dashboards | Dashboard + widget CRUD |

## Architecture

```
src/
├── api/               # HTTP infra: guards/, filters/, decorators/, dto/
├── analytics/         # AnalyticsModule — all analytics insight types
│   ├── analytics.module.ts
│   ├── with-analytics-cache.ts  # shared cache+query utility
│   ├── trend/         # trend.query.ts (factory provider via TREND_SERVICE token)
│   ├── funnel/        # funnel.query.ts, funnel-time-to-convert.ts (FUNNEL_SERVICE, FUNNEL_TTC_SERVICE tokens)
│   ├── retention/     # RetentionService, retention.query.ts
│   ├── lifecycle/     # LifecycleService, lifecycle.query.ts
│   ├── stickiness/    # StickinessService, stickiness.query.ts
│   └── paths/         # PathsService, paths.query.ts
├── auth/              # AuthService, AuthGuard, session management
├── projects/          # ProjectsService, ProjectsController
├── api-keys/          # ApiKeysService, ApiKeysController
├── events/            # EventsService (ClickHouse queries)
├── persons/           # PersonsService (ClickHouse queries)
├── cohorts/           # CohortsService, cohorts.query.ts
├── saved-insights/    # SavedInsightsService — CRUD for saved configs
├── dashboards/        # DashboardsService, DashboardsController
├── database/          # DatabaseModule (DRIZZLE, CLICKHOUSE, REDIS providers)
├── providers/         # Provider factories
├── throttler/         # RedisThrottlerStorage
├── utils/             # Shared utilities
└── test/              # Integration tests
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
- Services throw plain domain exceptions (extend base exception classes), never `HttpException`
- Base exception classes in `src/exceptions/`: `AppNotFoundException`, `AppConflictException`, `AppForbiddenException`, `AppUnauthorizedException`, `TooManyRequestsException`
- Cross-module exceptions (used by multiple modules) live in `src/exceptions/`, not in any single module's `exceptions/` dir
- Each module owns its concrete exceptions in `{module}/exceptions/`, extending the appropriate base class
- Exception filters use `createHttpFilter()` factory from `src/api/filters/create-http-filter.ts` — catches base class, maps to HTTP status
- Only `VerificationCooldownFilter` is a custom filter (returns `seconds_remaining` payload)
- Adding a new exception: extend the right base class, the filter catches it automatically via inheritance

### Auth Flow
1. Login/register → create session → return opaque bearer token
2. `AuthGuard` validates `Authorization: Bearer <token>` on every request
3. Session tokens stored as SHA-256 hashes in PostgreSQL, cached in Redis (60s TTL)

### Analytics Queries
All analytics services are created via `createAnalyticsQueryProvider()` factory in `src/analytics/analytics-query.factory.ts`. Each provider wraps a pure query function with shared logic:
1. Auth check (`getMembership`)
2. Resolve cohort IDs via `CohortsService.resolveCohortFilters()`
3. Resolve cohort breakdowns via `CohortsService.resolveCohortBreakdowns()` (if `breakdown_type === 'cohort'`)
4. Cache lookup in Redis → ClickHouse query → cache write (`withAnalyticsCache`)
5. Return `{ data, cached_at, from_cache }` envelope

Provider tokens are exported from `analytics.module.ts`: `TREND_SERVICE`, `FUNNEL_SERVICE`, `FUNNEL_TTC_SERVICE`, `RETENTION_SERVICE`, `LIFECYCLE_SERVICE`, `STICKINESS_SERVICE`, `PATHS_SERVICE`.

Controllers/tools inject via `@Inject(TREND_SERVICE) private readonly trendService: AnalyticsQueryService<TrendQueryParams, TrendQueryResult>`.

Query functions live in `src/analytics/{type}/{type}.query.ts`:
- `queryTrend(ch, params)` — time-series with granularity, compare, breakdown, cohort filters
- `queryFunnel(ch, params)` — multi-step conversion with window, breakdown, cohort filters
- `queryFunnelTimeToConvert(ch, params)` — time-to-convert histogram
- `queryRetention(ch, params)` — user retention over time periods
- `queryLifecycle(ch, params)` — new/returning/resurrecting/dormant classification
- `queryStickiness(ch, params)` — histogram of active periods per user
- `queryPaths(ch, params)` — user journey path exploration
- `countCohortMembers(ch, projectId, definition)` — behavioral cohort counting
- All queries use `FROM events FINAL` to deduplicate ReplacingMergeTree

### Shared Utilities
`src/utils/` contains shared code used across modules:
- `clickhouse-helpers.ts` — `granularityTruncExpr()`, `shiftPeriod()`, `buildCohortClause()`, `buildCohortFilterClause()`
- `property-filter.ts` — `FilterOperator` type, `PropertyFilter` interface, `buildPropertyFilterConditions()`, `resolvePropertyExpr()`
- `session-cache.ts` — `invalidateUserSessionCaches(db, redis, userId)` — shared between auth and verification modules
- `hash.ts` — `hashToken()` for SHA-256 session token hashing

`src/api/dto/shared/` contains shared DTO utilities:
- `filters.dto.ts` — `StepFilterDto` class, re-exports `FilterOperator` from `utils/property-filter.ts`
- `transforms.ts` — `parseJsonArray()` — shared `@Transform` for query params that arrive as JSON strings in GET requests

### Module Cohesion
All code is grouped by module. Controllers, services, guards, and exceptions for a feature all live inside that feature's directory. Base exception classes live in `src/exceptions/`, filter factory and custom filters live in `src/api/filters/`.

### Filter Registration
Filters registered via `APP_FILTER` provider in `ApiModule`, never via `app.useGlobalFilters()`. Most filters are created via `createHttpFilter(status, ...ExceptionClasses)` factory:
```typescript
const NotFoundFilter = createHttpFilter(HttpStatus.NOT_FOUND, AppNotFoundException);
// ...
{ provide: APP_FILTER, useClass: NotFoundFilter }
```

### Throttle Limits
20 req/s, 300 req/min per IP. Backed by `RedisThrottlerStorage` (sorted sets) in `src/throttler/`.

### Controller Return Types & `as any`
Controllers declare explicit return types (e.g. `Promise<CohortDto>`) so Swagger can generate correct response schemas. Drizzle ORM returns `InferSelectModel<T>` which is structurally compatible but not assignable to DTO classes, so `as any` is required on `return` statements. **Never remove `as any` from controller returns** — it will break Swagger generation.

### Query Parameters as DTO
When a controller accepts optional query parameters, group them into a DTO class with `@ApiPropertyOptional()` + `@IsOptional()` instead of using separate `@Query('name')` parameters. This ensures the generated API client types are correct (optional fields). Use `@Query() query: MyQueryDto` pattern.

### API Client Generation
Edit controllers → `pnpm swagger:generate` → `pnpm generate-api` → use updated `Api.ts` in frontend. The generated client strips `Dto` suffix from type names.

## Integration Tests

Tests in `src/test/{module}/`. Run with `vitest.integration.config.ts`.

- Use `setupContainers()` from `@qurvo/testing` for PostgreSQL + Redis + ClickHouse
- Date helpers (`daysAgo`, `ts`, `msAgo`, `dateOffset`) from `@qurvo/testing`
- API-specific `sumSeriesValues()` in `src/test/helpers/`
- 150 tests: trends (7), funnels (5), cohorts (9), retention (8), lifecycle (5), stickiness (7), paths, web-analytics, etc.
