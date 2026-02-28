# @qurvo/ch-query

Typed ClickHouse SQL query builder for the Qurvo analytics platform. Provides an AST-based approach to constructing parameterized ClickHouse queries with a fluent builder API. Also includes a cohort query DSL for translating UI-defined cohort definitions into ClickHouse SQL.

> **Internal package** -- not published to npm. Used by `@qurvo/api` and `@qurvo/cohort-worker`.

## Installation

```bash
# From the monorepo root
pnpm --filter @qurvo/ch-query build
```

Consumers add the dependency in their `package.json`:

```json
{
  "dependencies": {
    "@qurvo/ch-query": "workspace:*"
  }
}
```

## Quick Start

### Building a SELECT query

```typescript
import { select, col, count, eq, literal, compile } from '@qurvo/ch-query';

const query = select(col('event'), count().as('cnt'))
  .from('events')
  .where(eq(col('project_id'), literal('abc-123')))
  .groupBy(col('event'))
  .orderBy(col('cnt'), 'DESC')
  .limit(100)
  .build();

const { sql, params } = compile(query);
// sql:
//   SELECT
//     event,
//     count() AS cnt
//   FROM events
//   WHERE project_id = 'abc-123'
//   GROUP BY event
//   ORDER BY cnt DESC
//   LIMIT 100
```

### Using parameters

```typescript
import { select, col, param, eq, compile } from '@qurvo/ch-query';

const query = select(col('person_id'))
  .from('events')
  .where(eq(col('project_id'), param('UUID', projectId)))
  .build();

const { sql, params } = compile(query);
// sql:  SELECT person_id FROM events WHERE project_id = {p_0:UUID}
// params: { p_0: projectId }
```

### Combining conditions

```typescript
import { and, or, eq, gt, col, literal } from '@qurvo/ch-query';

const where = and(
  eq(col('project_id'), literal('abc')),
  or(
    eq(col('event'), literal('pageview')),
    gt(col('duration'), literal(30)),
  ),
);
// Compiles to: project_id = 'abc' AND (event = 'pageview' OR duration > 30)
```

### CTEs

```typescript
import { select, col, count, compile } from '@qurvo/ch-query';

const cte = select(col('person_id'), count().as('event_count'))
  .from('events')
  .groupBy(col('person_id'))
  .build();

const main = select(col('person_id'))
  .from('user_events')
  .with('user_events', cte)
  .build();

const { sql } = compile(main);
```

### Set operations

```typescript
import { select, col, intersect, unionAll, compile } from '@qurvo/ch-query';

const q1 = select(col('person_id')).from('cohort_a').build();
const q2 = select(col('person_id')).from('cohort_b').build();

const combined = intersect(q1, q2);     // persons in BOTH cohorts
const { sql } = compile(combined);
```

## API Reference

### Expression Factories

| Function | Description |
|---|---|
| `col(name)` | Column reference |
| `literal(value)` | String, number, or boolean literal |
| `param(chType, value)` | Named ClickHouse parameter `{p_N:Type}` |
| `raw(sql)` | Raw SQL passthrough |
| `rawWithParams(sql, params)` | Raw SQL with pre-named parameters |
| `func(name, ...args)` | Function call |
| `funcDistinct(name, ...args)` | Function call with DISTINCT |
| `alias(expr, name)` | Explicit alias wrapper |
| `subquery(selectNode)` | Wrap a SelectNode as an expression |

All expression factories return objects with an `.as(alias)` method for inline aliasing: `count().as('cnt')`.

### Aggregation Shortcuts

`count()`, `countDistinct(expr)`, `countIf(cond)`, `uniqExact(expr)`, `avg(expr)`, `avgIf(expr, cond)`, `sum(expr)`, `sumIf(expr, cond)`, `min(expr)`, `minIf(expr, cond)`, `max(expr)`, `maxIf(expr, cond)`, `groupArray(expr)`, `groupArrayIf(expr, cond)`, `arraySort(expr)`, `arrayFilter(lambda, expr)`, `toString(expr)`.

### Condition Builders

| Function | Description |
|---|---|
| `eq(l, r)` | `=` |
| `neq(l, r)` | `!=` |
| `gt(l, r)`, `gte(l, r)` | `>`, `>=` |
| `lt(l, r)`, `lte(l, r)` | `<`, `<=` |
| `like(l, r)`, `notLike(l, r)` | `LIKE`, `NOT LIKE` |
| `and(...exprs)` | AND (filters out `undefined`/`false`) |
| `or(...exprs)` | OR (filters out `undefined`/`false`) |
| `not(expr)` | NOT |
| `inSubquery(expr, select)` | `expr IN (SELECT ...)` |
| `notInSubquery(expr, select)` | `expr NOT IN (SELECT ...)` |
| `inArray(expr, paramExpr)` | `expr IN (array_param)` |
| `notInArray(expr, paramExpr)` | `expr NOT IN (array_param)` |
| `multiIf(branches, else)` | ClickHouse `multiIf()` |
| `add`, `sub`, `mul`, `div` | Arithmetic |

### SelectBuilder

```typescript
select(...columns)
  .from(table | subquery, alias?)
  .where(...conditions)      // ANDed together; undefined/false filtered out
  .prewhere(...conditions)   // ClickHouse PREWHERE
  .innerJoin(table, alias, on)
  .leftJoin(table, alias, on)
  .crossJoin(subquery, alias?)
  .groupBy(...exprs)
  .having(condition)
  .orderBy(expr, 'ASC' | 'DESC')
  .limit(n)
  .offset(n)
  .with(name, query)         // CTE
  .withAll(ctes)             // multiple CTEs
  .arrayJoin(arrayExpr, itemAlias)
  .build()                   // returns SelectNode
```

### Set Operations

| Function | SQL |
|---|---|
| `unionAll(...queries)` | `UNION ALL` |
| `intersect(...queries)` | `INTERSECT` |
| `unionDistinct(...queries)` | `UNION DISTINCT` |

### Compiler

| Function | Description |
|---|---|
| `compile(queryNode)` | Compile full query to `{ sql, params }` |
| `compileExprToSql(expr, targetParams?, ctx?)` | Compile single expression; optionally merge params |
| `new CompilerContext()` | Shared context for multiple `compileExprToSql` calls |

## Cohort Query DSL

The `cohort/` sub-module translates `CohortConditionGroup` definitions (stored in PostgreSQL, edited via the UI) into ClickHouse queries that return matching `person_id`s.

### Entry Points

```typescript
import {
  buildCohortSubquery,
  buildCohortFilterClause,
  topologicalSortCohorts,
  validateDefinitionComplexity,
} from '@qurvo/ch-query';
```

- **`buildCohortSubquery(definition, idx, projectIdParam, queryParams, resolve?, dateTo?, dateFrom?)`** -- builds a `QueryNode` from a cohort definition. AND groups become `INTERSECT`, OR groups become `UNION DISTINCT`.

- **`buildCohortFilterClause(cohorts, projectIdParam, queryParams, resolve?, dateTo?, dateFrom?)`** -- builds a `WHERE` clause (`RESOLVED_PERSON IN (...)`) for filtering analytics queries by cohort membership. Handles materialized, static, and inline cohorts.

- **`topologicalSortCohorts(cohorts)`** / **`groupCohortsByLevel(sorted)`** -- dependency-aware ordering for cohort-worker recomputation.

- **`validateDefinitionComplexity(definition)`** -- enforces max 50 leaf conditions and max 4 nesting depth.

### Supported Condition Types

`person_property`, `event` (performed), `cohort` (reference), `first_time_event`, `not_performed_event`, `event_sequence`, `not_performed_event_sequence`, `performed_regularly`, `stopped_performing`, `restarted_performing`.

## License

Private -- internal package.
