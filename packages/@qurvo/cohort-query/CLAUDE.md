# @qurvo/cohort-query

Cohort query DSL: translates UI-defined cohort definitions (`CohortConditionGroup` from `@qurvo/db`) into ClickHouse SQL that returns matching `person_id`s.

**This package contains domain-specific cohort logic.** The underlying SQL primitives (`select`, `col`, `compile`, etc.) come from `@qurvo/ch-query`. This package builds on top of them to express cohort semantics: condition types, operator resolution, property extraction, validation, and topological sorting of inter-cohort dependencies.

## Commands

```bash
pnpm --filter @qurvo/cohort-query build   # tsc -> dist/
pnpm --filter @qurvo/cohort-query dev     # tsc --watch
pnpm --filter @qurvo/cohort-query exec vitest run   # unit tests
```

## Exports

```typescript
// Builder — entry points for constructing cohort queries
import {
  buildCohortSubquery,
  buildCohortFilterClause,
} from '@qurvo/cohort-query';

// Validation — enforce complexity limits before building SQL
import {
  extractCohortReferences,
  detectCircularDependency,
  countLeafConditions,
  measureNestingDepth,
  validateDefinitionComplexity,
  MAX_TOTAL_CONDITIONS,     // 50
  MAX_NESTING_DEPTH,        // 4
} from '@qurvo/cohort-query';

// Topological sort — dependency-aware ordering for recomputation
import {
  topologicalSortCohorts,
  groupCohortsByLevel,
} from '@qurvo/cohort-query';
import type { CohortForSort, ToposortResult } from '@qurvo/cohort-query';

// Types
import type { CohortFilterInput, BuildContext } from '@qurvo/cohort-query';

// Helpers — property resolution, operator clauses, event filters
import {
  RESOLVED_PERSON,
  TOP_LEVEL_COLUMNS,
  DIRECT_COLUMNS,
  resolvedPerson,
  resolvePropertyExpr,
  resolveEventPropertyExpr,
  applyOperator,
  buildOperatorClause,
  resolveDateTo,
  resolveDateFrom,
  buildEventFilterClauses,
  allocCondIdx,
  ctxProjectIdExpr,
  eventsBaseSelect,
  validateJsonKey,
  escapeJsonKey,
  parsePropertyPath,
} from '@qurvo/cohort-query';
import type { PropertySource } from '@qurvo/cohort-query';

// Errors
import { CohortQueryValidationError } from '@qurvo/cohort-query';
```

## Structure

```
src/
  index.ts            # Public re-exports
  builder.ts          # buildCohortSubquery, buildCohortFilterClause
  helpers.ts          # Property resolution, operator mapping, event filters
  validation.ts       # Complexity checks, circular dependency detection
  toposort.ts         # Kahn's algorithm for cohort dependency ordering
  types.ts            # CohortFilterInput, BuildContext
  errors.ts           # CohortQueryValidationError
  conditions/         # Per-condition-type SQL builders
    property.ts       # person_property condition
    event.ts          # performed event condition
    cohort-ref.ts     # cohort reference (depends on another cohort)
    first-time.ts     # first_time_event condition
    not-performed.ts  # not_performed_event condition
    sequence.ts       # event_sequence condition
    sequence-core.ts  # shared windowFunnel logic
    not-performed-sequence.ts  # not_performed_event_sequence
    regularity.ts     # performed_regularly condition
    stopped.ts        # stopped_performing condition
    restarted.ts      # restarted_performing condition
  __tests__/
```

## Dependencies

- **`@qurvo/ch-query`** — SQL AST primitives (`select`, `col`, `param`, `compile`, etc.)
- **`@qurvo/db`** — `CohortConditionGroup`, `CohortCondition` types, `isConditionGroup()` guard

## Core Concepts

### Builder

`buildCohortSubquery(definition, idx, projectIdParam, queryParams, resolve?, dateTo?, dateFrom?)` — takes a `CohortConditionGroup` definition and builds a `QueryNode`. AND groups become `INTERSECT`, OR groups become `UNION DISTINCT`.

`buildCohortFilterClause(cohorts, projectIdParam, queryParams, resolve?, dateTo?, dateFrom?)` — builds a `WHERE` clause (`RESOLVED_PERSON IN (...)`) for filtering analytics queries by cohort membership. Handles materialized, static, and inline cohorts.

### Validation

`validateDefinitionComplexity(definition)` — enforces max 50 leaf conditions (`MAX_TOTAL_CONDITIONS`) and max 4 nesting depth (`MAX_NESTING_DEPTH`). Throws `CohortQueryValidationError` on violation.

`extractCohortReferences(definition)` — collects all referenced cohort IDs from a definition tree.

`detectCircularDependency(cohortId, definition, allDefinitions)` — detects circular cohort references.

### Topological Sort

`topologicalSortCohorts(cohorts)` — Kahn's algorithm for dependency-aware ordering. Returns `{ sorted, cyclic }`. References to cohort IDs not in the input set are ignored (assumed already fresh).

`groupCohortsByLevel(sorted)` — groups already-sorted cohorts into dependency levels for parallel recomputation. Level 0 = no in-set dependencies.

### Supported Condition Types

`person_property`, `event` (performed), `cohort` (reference), `first_time_event`, `not_performed_event`, `event_sequence`, `not_performed_event_sequence`, `performed_regularly`, `stopped_performing`, `restarted_performing`.

## Key Patterns

- **BuildContext** is threaded through all condition builders to share `projectIdParam`, `queryParams`, `counter`, and optional `dateTo`/`dateFrom` bounds
- **Each condition type** is a separate file in `conditions/` returning a `QueryNode` (usually a `SelectNode`)
- **Operator resolution** (`applyOperator`) maps UI operators (`equals`, `contains`, `greater_than`, etc.) to ClickHouse expressions
- **Property resolution** (`resolvePropertyExpr`) handles JSON extraction for event/person properties with proper escaping
