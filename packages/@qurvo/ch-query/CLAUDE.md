# @qurvo/ch-query

Generic ClickHouse SQL query builder: typed AST, fluent builders, parameterized compiler.

**ch-query is a PURE query builder.** It has no domain/analytics logic. It does not know about cohorts, funnels, events table, property resolution, or any application-specific concepts. Domain logic lives in `@qurvo/cohort-query` and `apps/api/src/analytics/query-helpers/`.

## Commands

```bash
pnpm --filter @qurvo/ch-query build   # tsc -> dist/
pnpm --filter @qurvo/ch-query dev     # tsc --watch
pnpm --filter @qurvo/ch-query exec vitest run   # unit tests
```

## Exports

```typescript
// AST types
import type {
  Expr, SelectNode, QueryNode, UnionAllNode, SetOperationNode,
  LambdaExpr, ParametricFuncCallExpr, IntervalExpr, NamedParamExpr,
  // ...
} from '@qurvo/ch-query';

// Compiler
import { compile, compileExprToSql, CompilerContext } from '@qurvo/ch-query';

// Expression factories
import {
  col, literal, param, raw, rawWithParams, func, funcDistinct, alias, subquery,
  parametricFunc, lambda, interval, namedParam,
} from '@qurvo/ch-query';

// Aggregation shortcuts
import {
  count, countIf, countDistinct, sum, sumIf, avg, avgIf, min, minIf, max, maxIf,
  uniqExact, groupArray, groupArrayIf, arraySort, arrayFilter, toString,
  argMax, argMinIf, argMaxIf, any, groupUniqArray,
} from '@qurvo/ch-query';

// ClickHouse functions
import {
  jsonExtractString, jsonExtractRaw, jsonHas,
  toFloat64OrZero, toDate, toInt64, toUInt64, toInt32, toUInt32, toUnixTimestamp64Milli,
  parseDateTimeBestEffortOrZero, parseDateTimeBestEffort, toDateTime, toDateTime64,
  toStartOfDay, toStartOfHour, toStartOfWeek, toStartOfMonth,
  dateDiff, length, has, now64, today, toUUID,
  dictGetOrNull, lower, match, multiSearchAny, coalesce, ifExpr,
  notEmpty, greatest, indexOf, arrayElement, sipHash64,
  arrayExists, arrayMin, arrayMax, arraySlice, arrayCompact, arrayEnumerate,
} from '@qurvo/ch-query';

// SQL utils
import { escapeLikePattern, like, notLike } from '@qurvo/ch-query';

// Condition builders
import {
  and, or, eq, neq, gt, gte, lt, lte, like, notLike, not,
  add, sub, mul, div, mod,
  inSubquery, notInSubquery, inArray, notInArray, multiIf,
} from '@qurvo/ch-query';

// Select builder (fluent API)
import { select, unionAll, intersect, unionDistinct, except, SelectBuilder } from '@qurvo/ch-query';
```

## Structure

```
src/
  ast.ts              # Expr, SelectNode, QueryNode type definitions
  builders.ts         # Expression factories, SelectBuilder, set operations
  compiler.ts         # CompilerContext, compile(), compileExprToSql()
  index.ts            # Public re-exports
  __tests__/
    builders.test.ts
    compiler.test.ts
```

## Dependencies

None. This is a pure TypeScript library with zero runtime dependencies.

## Core Concepts

### AST

All SQL is represented as a typed tree. Leaf nodes: `ColumnExpr`, `LiteralExpr`, `ParamExpr`, `RawExpr`, `RawWithParamsExpr`, `FuncCallExpr`, `ParametricFuncCallExpr`, `LambdaExpr`, `IntervalExpr`, `NamedParamExpr`. Composite: `BinaryExpr`, `InExpr`, `CaseExpr`, `AliasExpr`, `SubqueryExpr`, `ArrayJoinExpr`. Queries: `SelectNode`, `UnionAllNode`, `SetOperationNode`.

### Compiler

`compile(node: QueryNode)` walks the AST and returns `{ sql, params }`. Named parameters use ClickHouse syntax `{p_N:Type}`. `CompilerContext` deduplicates parameter names via an auto-incrementing counter.

`compileExprToSql(expr)` compiles a single expression (useful when building mixed raw+AST queries). Accepts an optional shared `CompilerContext` to prevent `p_0` collisions across multiple calls.

### SelectBuilder

Fluent chain: `select(col('x')).from('events').where(eq(...)).groupBy(...).build()` returns a `SelectNode`. Supports `.distinct()`, `.with()` (CTEs), `.arrayJoin()`, `.prewhere()`, all join types.

### Set Operations

`intersect(...)`, `unionAll(...)`, `unionDistinct(...)`, `except(...)` produce `SetOperationNode` / `UnionAllNode`.

### Parametric Functions

ClickHouse parametric functions like `windowFunnel(N)(cond1, cond2)` or `quantile(0.5)(expr)` use `parametricFunc(name, params, args)`. The compiler emits `name(params)(args)`.

### Lambda Expressions

`lambda(['x'], body)` compiles to `x -> body`. Multi-param: `lambda(['x', 'y'], body)` compiles to `(x, y) -> body`. Used with `arrayExists`, `arrayMax`, `arrayFilter`, etc.

### Named Parameters

`namedParam(key, chType, value)` creates a parameter with a caller-chosen name `{key:Type}` instead of the auto-incrementing `p_N`. Useful for stable parameter names in generated queries.

## Key Patterns

- **No ClickHouse client dependency** — this package is a pure SQL builder. Execution happens in consuming apps (`@qurvo/api`, `@qurvo/cohort-worker`, etc.)
- **RawWithParamsExpr** is the escape hatch for code that generates complex SQL with embedded parameters. The compiler merges those params into CompilerContext automatically
- **WithAlias** mixin adds `.as(alias)` to expression factories, enabling `func('toStartOfDay', col('ts')).as('day')`
