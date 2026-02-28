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
} from './helpers';

// String-returning bridge functions (backward compat for condition builders)
export {
  resolvePropertyExprStr,
  resolveEventPropertyExprStr,
  buildOperatorClauseStr,
  resolveDateToStr,
  resolveDateFromStr,
  buildEventFilterClausesStr,
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
