/**
 * @qurvo/cohort-query — backward-compatible re-export wrapper.
 *
 * All cohort query logic has been moved to @qurvo/ch-query/src/cohort/.
 * This package re-exports everything so existing consumers
 * (apps/api, apps/cohort-worker) continue to compile without changes.
 */
export {
  // Builder
  buildCohortSubquery,
  buildCohortFilterClause,

  // Validation
  extractCohortReferences,
  detectCircularDependency,
  countLeafConditions,
  measureNestingDepth,
  validateDefinitionComplexity,
  MAX_TOTAL_CONDITIONS,
  MAX_NESTING_DEPTH,

  // Toposort
  topologicalSortCohorts,
  groupCohortsByLevel,

  // Errors
  CohortQueryValidationError,

  // Helpers — re-exported under original names.
  // The cohort-specific resolvePropertyExpr (with argMax) is namespaced
  // in ch-query's main index as `cohortResolvePropertyExpr`, but we
  // re-export it under the original name here for backward compat.
  cohortResolvePropertyExpr as resolvePropertyExpr,
  cohortResolveEventPropertyExpr as resolveEventPropertyExpr,
  cohortBuildOperatorClause as buildOperatorClause,
  cohortBuildEventFilterClauses as buildEventFilterClauses,
  cohortResolveDateTo as resolveDateTo,
  cohortResolveDateFrom as resolveDateFrom,
  TOP_LEVEL_COLUMNS,

  // RESOLVED_PERSON is available directly (not renamed)
  RESOLVED_PERSON,
} from '@qurvo/ch-query';

export type {
  CohortForSort,
  ToposortResult,
  CohortFilterInput,
  BuildContext,
} from '@qurvo/ch-query';
