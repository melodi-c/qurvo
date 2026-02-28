# @qurvo/ch-query

ClickHouse SQL query builder: typed AST, fluent builders, parameterized compiler. Also includes the cohort query DSL (conditions, builder, validation, toposort) -- previously a separate `@qurvo/cohort-query` package, merged here after #697/#715.

## Commands

```bash
pnpm --filter @qurvo/ch-query build   # tsc -> dist/
pnpm --filter @qurvo/ch-query dev     # tsc --watch
pnpm --filter @qurvo/ch-query exec vitest run   # unit tests
```

## Exports

```typescript
// AST types
import type { Expr, SelectNode, QueryNode, UnionAllNode, SetOperationNode, ... } from '@qurvo/ch-query';

// Compiler
import { compile, compileExprToSql, CompilerContext } from '@qurvo/ch-query';

// Expression builders
import { col, literal, param, raw, rawWithParams, func, alias, subquery } from '@qurvo/ch-query';

// Aggregation shortcuts
import { count, countIf, sum, avg, min, max, uniqExact, groupArray, ... } from '@qurvo/ch-query';

// Condition builders
import { and, or, eq, neq, gt, lt, like, not, inSubquery, multiIf, ... } from '@qurvo/ch-query';

// Select builder (fluent API)
import { select, unionAll, intersect, unionDistinct, SelectBuilder } from '@qurvo/ch-query';

// Cohort DSL
import {
  buildCohortSubquery, buildCohortFilterClause,
  extractCohortReferences, detectCircularDependency,
  validateDefinitionComplexity, topologicalSortCohorts, groupCohortsByLevel,
  cohortBuildOperatorClause, cohortResolvePropertyExpr, cohortResolveEventPropertyExpr,
  CohortQueryValidationError,
} from '@qurvo/ch-query';
```

## Structure

```
src/
  ast.ts              # Expr, SelectNode, QueryNode type definitions
  builders.ts         # Expression factories, SelectBuilder, set operations
  compiler.ts         # CompilerContext, compile(), compileExprToSql()
  index.ts            # Public re-exports
  cohort/
    index.ts          # Cohort sub-module re-exports
    types.ts          # CohortFilterInput, BuildContext
    builder.ts        # buildCohortSubquery(), buildCohortFilterClause()
    helpers.ts        # resolvePropertyExpr(), buildOperatorClause(), resolveDateTo/From(), etc.
    validation.ts     # extractCohortReferences(), detectCircularDependency(), complexity limits
    toposort.ts       # topologicalSortCohorts(), groupCohortsByLevel()
    errors.ts         # CohortQueryValidationError
    conditions/       # Per-type condition builders (each returns SelectNode)
      property.ts     # person_property
      event.ts        # performed_event
      cohort-ref.ts   # cohort reference (materialized / static / inline)
      first-time.ts   # first_time_event
      not-performed.ts           # not_performed_event
      not-performed-sequence.ts  # not_performed_event_sequence
      sequence.ts     # event_sequence (ordered multi-step)
      sequence-core.ts # shared sequence SQL generation
      regularity.ts   # performed_regularly
      stopped.ts      # stopped_performing
      restarted.ts    # restarted_performing
  __tests__/
    builders.test.ts
    compiler.test.ts
    cohort/           # cohort-specific unit tests
```

## Dependencies

- `@qurvo/db` -- CohortCondition / CohortConditionGroup types, `isConditionGroup()` guard

## Core Concepts

### AST

All SQL is represented as a typed tree. Leaf nodes: `ColumnExpr`, `LiteralExpr`, `ParamExpr`, `RawExpr`, `RawWithParamsExpr`, `FuncCallExpr`. Composite: `BinaryExpr`, `InExpr`, `CaseExpr`, `AliasExpr`, `SubqueryExpr`, `ArrayJoinExpr`. Queries: `SelectNode`, `UnionAllNode`, `SetOperationNode`.

### Compiler

`compile(node: QueryNode)` walks the AST and returns `{ sql, params }`. Named parameters use ClickHouse syntax `{p_N:Type}`. `CompilerContext` deduplicates parameter names via an auto-incrementing counter.

`compileExprToSql(expr)` compiles a single expression (useful when building mixed raw+AST queries). Accepts an optional shared `CompilerContext` to prevent `p_0` collisions across multiple calls.

### SelectBuilder

Fluent chain: `select(col('x')).from('events').where(eq(...)).groupBy(...).build()` returns a `SelectNode`. Supports `.with()` (CTEs), `.arrayJoin()`, `.prewhere()`, all join types.

### Set Operations

`intersect(...)`, `unionAll(...)`, `unionDistinct(...)` produce `SetOperationNode` / `UnionAllNode`. Used by the cohort builder for AND/OR groups.

## Cohort DSL

The `cohort/` sub-module translates a `CohortConditionGroup` (JSON definition from the UI) into a ClickHouse `QueryNode` that returns matching `person_id`s.

### Condition Types

| Type | Builder | Description |
|---|---|---|
| `person_property` | `property.ts` | Filter by person/event property |
| `event` (performed_event) | `event.ts` | User performed event N times in window |
| `cohort` | `cohort-ref.ts` | Member of another cohort (materialized, static, or inline) |
| `first_time_event` | `first-time.ts` | User performed event for the first time in window |
| `not_performed_event` | `not-performed.ts` | User did NOT perform event in window |
| `event_sequence` | `sequence.ts` | Ordered multi-step event sequence |
| `not_performed_event_sequence` | `not-performed-sequence.ts` | User did NOT complete sequence |
| `performed_regularly` | `regularity.ts` | User performed event in N distinct periods |
| `stopped_performing` | `stopped.ts` | User performed in earlier window but not in recent window |
| `restarted_performing` | `restarted.ts` | Reverse of stopped: absent earlier, present recently |

### Key Functions

- `buildCohortSubquery(definition, idx, projectIdParam, queryParams, ...)` -- main entry point; validates complexity then recursively builds QueryNode from nested AND/OR groups
- `buildCohortFilterClause(cohorts, ...)` -- builds `RESOLVED_PERSON IN (...)` WHERE clause for analytics queries; handles materialized (cohort_members FINAL), static (person_static_cohort FINAL), and inline cohorts
- `extractCohortReferences(group)` / `detectCircularDependency(...)` -- DAG validation
- `topologicalSortCohorts(cohorts)` / `groupCohortsByLevel(sorted)` -- dependency ordering for cohort-worker recomputation
- `validateDefinitionComplexity(definition)` -- enforces MAX_TOTAL_CONDITIONS (50) and MAX_NESTING_DEPTH (4)

### BuildContext

```typescript
interface BuildContext {
  projectIdParam: string;           // ClickHouse param name for project_id
  queryParams: Record<string, unknown>; // accumulates params
  counter: { value: number };       // unique param name counter
  dateTo?: string;                  // upper bound for behavioral conditions
  dateFrom?: string;                // lower bound for not_performed_event
}
```

When `dateTo`/`dateFrom` are set (e.g., from a funnel query's date range), behavioral conditions use the fixed interval instead of `now()`. This ensures reproducible results for historical analysis.

## Key Patterns

- **No ClickHouse client dependency** -- this package is a pure SQL builder. Execution happens in consuming apps (`@qurvo/api`, `@qurvo/cohort-worker`)
- **RawWithParamsExpr** is the escape hatch for cohort condition builders that generate complex SQL with embedded parameters. The compiler merges those params into CompilerContext automatically
- **String-returning bridge functions** (`*Str` suffix in `helpers.ts`) are deprecated -- they exist for backward compatibility with condition builders still using raw SQL. New code should use the Expr-returning variants
- **Condition builder registry** (`CONDITION_BUILDERS` in `builder.ts`) maps each `CohortCondition['type']` to its builder function. Adding a new condition type requires: (1) add type to `@qurvo/db` schema, (2) write builder in `conditions/`, (3) register in the map
- **RESOLVED_PERSON** constant contains the SQL for `coalesce(dictGetOrNull('person_overrides_dict', ...), person_id)` -- used everywhere cohort queries resolve canonical person IDs
