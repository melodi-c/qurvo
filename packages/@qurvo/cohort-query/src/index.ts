// Expr-returning helpers (primary API)
export {
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
  // Property path helpers (shared with analytics)
  validateJsonKey,
  escapeJsonKey,
  parsePropertyPath,
} from './helpers';
export type { PropertySource } from './helpers';

// Builder
export { buildCohortSubquery, buildCohortFilterClause, buildCohortMemberSubquery } from './builder';

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
