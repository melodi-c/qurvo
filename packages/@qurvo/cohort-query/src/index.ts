/**
 * @qurvo/cohort-query — backward-compatible re-export wrapper.
 *
 * All cohort query logic has been moved to @qurvo/ch-query/src/cohort/.
 * This package re-exports everything so existing consumers
 * (apps/api, apps/cohort-worker) continue to compile without changes.
 *
 * After the ch-query migration (#699), buildCohortSubquery returns QueryNode
 * and buildCohortFilterClause returns Expr. This wrapper provides
 * string-returning versions for backward compatibility until consumers
 * are updated (#700).
 */
import {
  buildCohortSubquery as buildCohortSubqueryNode,
  buildCohortFilterClause as buildCohortFilterClauseExpr,
  compile,
  compileExprToSql,
  RESOLVED_PERSON,
} from '@qurvo/ch-query';
import type { CohortConditionGroup } from '@qurvo/db';
import type { CohortFilterInput } from '@qurvo/ch-query';

/**
 * String-returning wrapper around ch-query's buildCohortSubquery.
 * Returns compiled SQL string for backward compatibility.
 */
export function buildCohortSubquery(
  definition: CohortConditionGroup,
  cohortIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
  dateTo?: string,
  dateFrom?: string,
): string {
  const node = buildCohortSubqueryNode(definition, cohortIdx, projectIdParam, queryParams, resolveCohortIsStatic, dateTo, dateFrom);
  const { sql, params } = compile(node);
  // Merge compiled params into the caller's queryParams for backward compat.
  // The condition builders already populate queryParams via side effects,
  // but the compiler may generate additional p_N params from Expr nodes.
  Object.assign(queryParams, params);
  return sql;
}

/**
 * String-returning wrapper around ch-query's buildCohortFilterClause.
 * Returns compiled SQL string for backward compatibility.
 */
export function buildCohortFilterClause(
  cohorts: CohortFilterInput[],
  projectIdParam: string,
  queryParams: Record<string, unknown>,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
  dateTo?: string,
  dateFrom?: string,
): string {
  const expr = buildCohortFilterClauseExpr(cohorts, projectIdParam, queryParams, resolveCohortIsStatic, dateTo, dateFrom);
  if (!expr) return '';
  const { sql, params } = compileExprToSql(expr);
  Object.assign(queryParams, params);
  return sql;
}

export {
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
