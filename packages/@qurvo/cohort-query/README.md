# @qurvo/cohort-query

Cohort query DSL for the Qurvo analytics platform. Translates UI-defined cohort definitions into ClickHouse SQL queries that return matching `person_id`s.

> **Internal package** -- not published to npm. Used by `@qurvo/api` and `@qurvo/cohort-worker`.

## Installation

```bash
# From the monorepo root
pnpm --filter @qurvo/cohort-query build
```

Consumers add the dependency in their `package.json`:

```json
{
  "dependencies": {
    "@qurvo/cohort-query": "workspace:*"
  }
}
```

## Quick Start

### Building a cohort subquery

```typescript
import { buildCohortSubquery } from '@qurvo/cohort-query';
import { compile } from '@qurvo/ch-query';

const queryParams: Record<string, unknown> = {};
const queryNode = buildCohortSubquery(definition, 0, projectId, queryParams);
const { sql, params } = compile(queryNode);
// sql: SELECT DISTINCT resolved_person FROM events WHERE ... INTERSECT SELECT ...
```

### Filtering analytics queries by cohort

```typescript
import { buildCohortFilterClause } from '@qurvo/cohort-query';

const whereClause = buildCohortFilterClause(
  cohorts,
  projectIdParam,
  queryParams,
);
// Returns an Expr that compiles to: resolved_person IN (SELECT ...)
```

### Validating cohort complexity

```typescript
import { validateDefinitionComplexity } from '@qurvo/cohort-query';

// Throws CohortQueryValidationError if definition exceeds limits
validateDefinitionComplexity(definition);
```

### Topological sorting for recomputation

```typescript
import {
  topologicalSortCohorts,
  groupCohortsByLevel,
} from '@qurvo/cohort-query';

const { sorted, cyclic } = topologicalSortCohorts(cohorts);
const levels = groupCohortsByLevel(sorted);
// levels[0] = cohorts with no dependencies (compute first)
// levels[1] = cohorts depending on level 0, etc.
```

## API Reference

### Builder

| Function | Description |
|---|---|
| `buildCohortSubquery(definition, idx, projectIdParam, queryParams, resolve?, dateTo?, dateFrom?)` | Builds a `QueryNode` from a cohort definition. AND groups become `INTERSECT`, OR groups become `UNION DISTINCT`. |
| `buildCohortFilterClause(cohorts, projectIdParam, queryParams, resolve?, dateTo?, dateFrom?)` | Builds a `WHERE` clause (`RESOLVED_PERSON IN (...)`) for filtering analytics queries by cohort membership. Handles materialized, static, and inline cohorts. |

### Validation

| Function | Description |
|---|---|
| `validateDefinitionComplexity(definition)` | Enforces max 50 leaf conditions and max 4 nesting depth. Throws `CohortQueryValidationError`. |
| `extractCohortReferences(definition)` | Collects all referenced cohort IDs from a definition tree. |
| `detectCircularDependency(cohortId, definition, allDefinitions)` | Detects circular cohort references. |
| `countLeafConditions(group)` | Counts total leaf conditions across all nesting levels. |
| `measureNestingDepth(group)` | Measures maximum nesting depth of a definition tree. |

### Topological Sort

| Function | Description |
|---|---|
| `topologicalSortCohorts(cohorts)` | Kahn's algorithm for dependency-aware ordering. Returns `{ sorted, cyclic }`. |
| `groupCohortsByLevel(sorted)` | Groups sorted cohorts into dependency levels for parallel recomputation. |

### Helpers

| Function | Description |
|---|---|
| `resolvePropertyExpr(source, key)` | Resolves a property name to a ClickHouse expression (JSON extraction with escaping). |
| `resolveEventPropertyExpr(key)` | Resolves an event property to a ClickHouse expression. |
| `applyOperator(expr, operator, value, ctx)` | Maps a UI operator (`equals`, `contains`, etc.) to a ClickHouse condition expression. |
| `buildOperatorClause(expr, operator, values, ctx)` | Builds a complete operator clause with multiple values. |
| `buildEventFilterClauses(filters, ctx)` | Builds WHERE clauses for event-level filters. |
| `parsePropertyPath(path)` | Parses dot-notation property paths. |
| `validateJsonKey(key)` / `escapeJsonKey(key)` | JSON key validation and escaping. |

### Constants

| Constant | Value | Description |
|---|---|---|
| `MAX_TOTAL_CONDITIONS` | `50` | Maximum total leaf conditions allowed |
| `MAX_NESTING_DEPTH` | `4` | Maximum nesting depth for condition groups |

### Supported Condition Types

| Type | Description |
|---|---|
| `person_property` | Filter by person property values |
| `event` | Person performed a specific event |
| `cohort` | Reference to another cohort |
| `first_time_event` | Person performed event for the first time |
| `not_performed_event` | Person did NOT perform a specific event |
| `event_sequence` | Person performed events in a specific order (windowFunnel) |
| `not_performed_event_sequence` | Person did NOT perform events in order |
| `performed_regularly` | Person performed event with regular frequency |
| `stopped_performing` | Person stopped performing an event |
| `restarted_performing` | Person restarted performing an event after stopping |

## License

Private -- internal package.
