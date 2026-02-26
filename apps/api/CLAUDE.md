# API App

NestJS REST API for the dashboard. Port 3000.

## Commands

```bash
pnpm --filter @qurvo/api dev          # watch mode
pnpm --filter @qurvo/api build        # nest build → dist/
pnpm --filter @qurvo/api start        # node dist/main.js

# Tests (testcontainers — no manual infra needed)
pnpm --filter @qurvo/api exec vitest run --config vitest.integration.config.ts
pnpm --filter @qurvo/api exec vitest run --config vitest.unit.config.ts

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
| `AuthModule` | Auth | Login/register/logout, sessions, `AuthGuard`, `AccountService` (profile/password) |
| `ProjectsModule` | Projects CRUD | Project management, members |
| — | _(removed)_ | API keys replaced by `token` field on `projects` |
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
├── projects/          # ProjectsService (creates token on project creation)
├── events/            # EventsService (ClickHouse queries)
├── persons/           # PersonsService (ClickHouse queries)
├── cohorts/           # CohortsService, cohorts.query.ts
├── saved-insights/    # SavedInsightsService — CRUD for saved configs
├── dashboards/        # DashboardsService, DashboardsController
├── database/          # DatabaseModule (DRIZZLE, CLICKHOUSE, REDIS providers)
├── providers/         # Provider factories
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
- Base exception classes in `src/exceptions/`: `AppNotFoundException`, `AppConflictException`, `AppForbiddenException`, `AppUnauthorizedException`, `AppBadRequestException`, `AppUnprocessableEntityException`, `TooManyRequestsException`
- Cross-module exceptions (used by multiple modules) live in `src/exceptions/`, not in any single module's `exceptions/` dir
- Each module owns its concrete exceptions in `{module}/exceptions/`, extending the appropriate base class
- Exception filters use `createHttpFilter()` factory from `src/api/filters/create-http-filter.ts` — catches base class, maps to HTTP status
- Only `VerificationCooldownFilter` is a custom filter (returns `seconds_remaining` payload)
- Adding a new exception: extend the right base class, the filter catches it automatically via inheritance
- AI-safe exceptions: base classes `AppBadRequestException` and `AppNotFoundException` have `isSafeForAi = true`. The AI tool error handler uses this flag to decide whether to expose the message to the LLM. To mark a new exception as AI-safe, add `readonly isSafeForAi = true` to the class — no changes needed in `AiService`

### Auth Flow
1. Login/register → create session → return opaque bearer token
2. `SessionAuthGuard` is registered as a **global guard** via `APP_GUARD` in `AppModule`. All endpoints are authenticated by default.
3. Public endpoints (register, login, verify-email/token, health) use `@Public()` decorator from `src/api/decorators/public.decorator.ts` to skip auth
4. Session tokens stored as SHA-256 hashes in PostgreSQL, cached in Redis (60s TTL)

### UUID Path Parameter Validation
All UUID path parameters (`cohortId`, `dashboardId`, `personId`, etc.) use NestJS `ParseUUIDPipe` for automatic format validation. Exception: `projectId` is validated by `ProjectMemberGuard` (regex check) instead, since it goes through the guard before reaching the handler.

### Project Authorization (ProjectMemberGuard)
Project-scoped endpoints use `ProjectMemberGuard` (from `src/api/guards/project-member.guard.ts`) instead of calling `getMembership()` in every service method:
1. Guard reads `projectId` from `request.params.projectId` or `request.query.project_id`
2. Validates UUID format via regex before querying DB
3. Calls `ProjectsService.getMembership()` once to verify access
4. If `@RequireRole('editor')` or `@RequireRole('owner')` is present, checks role hierarchy via `PROJECT_ROLE_LEVELS` from `constants.ts`: `owner (3) > editor (2) > viewer (1)`
5. Guard throws `AppBadRequestException` when `projectId` is missing from request
6. All write operations (POST/PUT/DELETE) on project-scoped controllers must use `@RequireRole('editor')` or `@RequireRole('owner')`

**Not guarded** (by design): `AuthController`, `ProjectsController` (mixed endpoints, uses `:id` not `:projectId`), `HealthController` (`@Public()`), `MyInvitesController` (user-scoped). `AiController` uses `ProjectMemberGuard` for list/get/delete endpoints; only the SSE `chat` endpoint uses manual `AiService.validateChatAccess()` **before** `writeHead` so auth errors return proper HTTP status codes instead of being swallowed into SSE events.

### Analytics Queries
All analytics services are created via `createAnalyticsQueryProvider()` factory in `src/analytics/analytics-query.factory.ts`. Each provider wraps a pure query function with shared logic:
1. Resolve cohort IDs via `CohortsService.resolveCohortFilters()`
2. Resolve cohort breakdowns via `CohortsService.resolveCohortBreakdowns()` (if `breakdown_type === 'cohort'`)
3. Cache lookup in Redis → ClickHouse query → cache write (`withAnalyticsCache`)
4. Return `{ data, cached_at, from_cache }` envelope

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
- Queries use `FROM events` (without FINAL) — duplicate rate is negligible (~0.00007%), FINAL disables projections and adds 2-3x overhead
- `cohort_members FINAL` and `person_static_cohort FINAL` still use FINAL (small tables, correctness matters)

### Shared Utilities
`src/utils/` contains shared code used across modules:
- `clickhouse-helpers.ts` — `granularityTruncExpr()`, `shiftPeriod()`, `buildCohortClause()`, `buildCohortFilterClause()`, `shiftDate()`, `truncateDate()`, `granularityInterval()`
- `property-filter.ts` — `FilterOperator` type, `PropertyFilter` interface, `buildPropertyFilterConditions()`, `resolvePropertyExpr()`, `resolveNumericPropertyExpr()`
- `escape-like.ts` — `escapeLikePattern()` for escaping LIKE wildcards in user input
- `pg-errors.ts` — `isPgUniqueViolation()` for checking PostgreSQL unique constraint violations
- `session-cache.ts` — `invalidateUserSessionCaches(db, redis, userId)` — shared between auth and verification modules
- `hash.ts` — `hashToken()` for SHA-256 session token hashing
- `build-conditional-update.ts` — `buildConditionalUpdate(input, fields)` — builds partial update objects from optional input fields
- Session cache key prefix: use `SESSION_CACHE_KEY_PREFIX` from `constants.ts` — never hardcode `"session:"` prefix

`src/api/dto/shared/` contains shared DTO utilities:
- `base-analytics-query.dto.ts` — `CoreQueryDto` base class with common fields (`project_id`, `date_from`, `date_to`, `force?`). Uses `@IsDateOnly()` for date validation (YYYY-MM-DD only). `BaseAnalyticsQueryDto` extends it adding `cohort_ids?` and `widget_id?`. Analytics query DTOs extend `BaseAnalyticsQueryDto`; `WebAnalyticsQueryDto` extends `CoreQueryDto`.
- `is-date-only.decorator.ts` — Custom `@IsDateOnly()` validator that enforces strict YYYY-MM-DD format (rejects ISO datetimes with timezone offsets that ClickHouse can't handle)
- `base-analytics-response.dto.ts` — `BaseAnalyticsResponseDto` with `cached_at` and `from_cache`. All analytics response DTOs extend it
- `filters.dto.ts` — `StepFilterDto` class
- `transforms.ts` — `parseJsonArray()` for query params arriving as JSON strings (throws `AppBadRequestException` on invalid JSON); `makeJsonArrayTransform(TargetClass)` for JSON-encoded arrays that need `plainToInstance` instantiation

### Controller Organization
Controllers and DTOs live in `src/api/controllers/` and `src/api/dto/`, **not** inside feature module directories. This is intentional: `ApiModule` acts as a **composition layer** — controllers may inject services from multiple feature modules (e.g. a dashboard controller using both `DashboardsService` and `AnalyticsService`). Feature modules (`src/{feature}/`) contain only services, queries, and domain exceptions. **Do not move controllers into feature modules.**

### Module Cohesion
Feature code is grouped by module. Services, queries, and exceptions for a feature live inside that feature's directory. Base exception classes live in `src/exceptions/`, filter factory and custom filters live in `src/api/filters/`.

### Filter Registration
Filters registered via `APP_FILTER` provider in `ApiModule`, never via `app.useGlobalFilters()`. Most filters are created via `createHttpFilter(status, ...ExceptionClasses)` factory:
```typescript
const NotFoundFilter = createHttpFilter(HttpStatus.NOT_FOUND, AppNotFoundException);
// ...
{ provide: APP_FILTER, useClass: NotFoundFilter }
```

### Throttle Limits
20 req/s, 300 req/min per IP. Backed by `@nest-lab/throttler-storage-redis` (Lua script, fixed-window, atomic INCR + conditional PEXPIRE).

### Swagger & `@ApiProperty` Decorators
Swagger schema is generated via `swagger-cli` from the compiled NestJS metadata. Most DTO fields are inferred automatically — **do not add `@ApiProperty` to every field**. Only use decorators when the auto-inferred type is wrong or ambiguous:
- `@ApiProperty({ type: [NestedDto] })` — arrays of nested objects (auto-inference loses the element type)
- `@ApiProperty({ enum: [...] })` — string unions/enums that should appear as enum in OpenAPI
- `@ApiPropertyOptional()` — optional fields that need explicit optionality in the schema
- `@ApiProperty({ type: 'object' })` — `Record<string, unknown>` or other generic object types

**IMPORTANT: String union fields on response DTOs MUST have `@ApiProperty({ enum: [...] })`**. Without it, the swagger generator emits `object` instead of `string`, which breaks the generated TypeScript client. This applies to both request and response DTOs — any field typed as a string union (e.g. `role: 'owner' | 'editor' | 'viewer'`) needs the decorator.

**IMPORTANT: DTO field types must be classes, not interfaces or anonymous types.** Swagger metadata reflection only works with classes. If a DTO field references an interface (e.g. `features: PlanFeatures`) or an inline object type (e.g. `project: { id: string; name: string }`), swagger will emit `object` instead of the proper schema. Always define nested types as DTO classes and reference them: `@ApiProperty({ type: PlanFeaturesDto }) features: PlanFeaturesDto`.

### Controller Return Types & `as any`
Controllers declare explicit return types (e.g. `Promise<CohortDto>`) so Swagger can generate correct response schemas. Drizzle ORM returns `InferSelectModel<T>` which is structurally compatible but not assignable to DTO classes, so `as any` is required on `return` statements. **Never remove `as any` from controller returns** — it will break Swagger generation. Void actions (delete, revoke, etc.) return `Promise<void>` — never `{ ok: true }`.

### Query Parameters as DTO
When a controller accepts optional query parameters, group them into a DTO class with `@ApiPropertyOptional()` + `@IsOptional()` instead of using separate `@Query('name')` parameters. This ensures the generated API client types are correct (optional fields). Use `@Query() query: MyQueryDto` pattern.

### API Client Generation
Edit controllers → `pnpm swagger:generate` → `pnpm generate-api` → use updated `Api.ts` in frontend. The generated client strips `Dto` suffix from type names.

## Integration Tests

Tests in `src/test/{module}/`.

- Use `getTestContext()` from `src/test/context.ts` for PostgreSQL + Redis + ClickHouse — do **not** call `setupContainers()` directly in test files
- Date helpers (`daysAgo`, `ts`, `msAgo`, `dateOffset`) from `@qurvo/testing`
- API-specific `sumSeriesValues()` in `src/test/helpers/`
- 132 tests: trends (11), funnels (14), cohorts (20), retention (8), lifecycle (5), stickiness (7), paths (11), persons (9), event/property-definitions (27), etc.
