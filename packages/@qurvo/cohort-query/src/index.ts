// Expr-returning helpers (primary API)
export {
  RESOLVED_PERSON,
  TOP_LEVEL_COLUMNS,
  resolvePropertyExpr,
  resolveEventPropertyExpr,
  buildOperatorClause,
  resolveDateTo,
  resolveDateFrom,
  buildEventFilterClauses,
  allocCondIdx,
} from './helpers';

// Deprecated string-returning bridge functions (backward compat for external consumers)
export {
  resolvePropertyExprStr,
  resolveEventPropertyExprStr,
  buildOperatorClauseStr,
  resolveDateToStr,
  resolveDateFromStr,
  buildEventFilterClausesStr,
  buildCountIfCondStr,
  buildEventsBaseSelect,
} from './helpers';

// Builder
export { buildCohortSubquery, buildCohortFilterClause } from './builder';

// Validation
export {
  extractCohortReferences,
  detectCircularDependency,
  countLeafConditions,
  measureNestingDepth,
  validateDefinitionComplexity,
  MAX_TOTAL_CONDITIONS,
  MAX_NESTING_DEPTH,
} from './validation';

// Toposort
export { topologicalSortCohorts, groupCohortsByLevel } from './toposort';
export type { CohortForSort, ToposortResult } from './toposort';

// Types
export type { CohortFilterInput, BuildContext } from './types';

// Errors
export { CohortQueryValidationError } from './errors';
