export { RESOLVED_PERSON, resolvePropertyExpr, resolveEventPropertyExpr, buildEventFilterClauses, buildOperatorClause, TOP_LEVEL_COLUMNS } from './helpers';
export { buildCohortSubquery, buildCohortFilterClause } from './builder';
export {
  extractCohortReferences,
  detectCircularDependency,
  countLeafConditions,
  measureNestingDepth,
  validateDefinitionComplexity,
  MAX_TOTAL_CONDITIONS,
  MAX_NESTING_DEPTH,
} from './validation';
export { topologicalSortCohorts, groupCohortsByLevel } from './toposort';
export type { CohortForSort, ToposortResult } from './toposort';
export type { CohortFilterInput, BuildContext } from './types';
export { CohortQueryValidationError } from './errors';
