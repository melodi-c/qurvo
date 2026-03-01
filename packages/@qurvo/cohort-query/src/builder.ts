import type { CohortCondition, CohortConditionGroup } from '@qurvo/db';
import { isConditionGroup } from '@qurvo/db';
import type { Expr, QueryNode, SelectNode } from '@qurvo/ch-query';
import { select, col, namedParam, eq, and, intersect, unionDistinct, inSubquery, toUUID, literal } from '@qurvo/ch-query';
import { resolvedPerson } from './helpers';
import type { BuildContext, CohortFilterInput } from './types';
import { buildPropertyConditionSubquery } from './conditions/property';
import { buildEventConditionSubquery } from './conditions/event';
import { buildCohortRefConditionSubquery } from './conditions/cohort-ref';
import { buildFirstTimeEventSubquery } from './conditions/first-time';
import { buildNotPerformedEventSubquery } from './conditions/not-performed';
import { buildEventSequenceSubquery } from './conditions/sequence';
import { buildPerformedRegularlySubquery } from './conditions/regularity';
import { buildStoppedPerformingSubquery } from './conditions/stopped';
import { buildRestartedPerformingSubquery } from './conditions/restarted';
import { buildNotPerformedEventSequenceSubquery } from './conditions/not-performed-sequence';
import { validateDefinitionComplexity } from './validation';

// Strategy registry

type ConditionType = CohortCondition['type'];

/**
 * Unified builder signature: each handler receives the condition (narrowed to
 * its concrete type), the build context, and the optional cohort-resolution
 * callback (only used by the 'cohort' handler; others safely ignore it).
 */
type ConditionBuilder<T extends CohortCondition = CohortCondition> = (
  cond: T,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
) => SelectNode;

const CONDITION_BUILDERS: { [K in ConditionType]: ConditionBuilder<Extract<CohortCondition, { type: K }>> } = {
  person_property: (cond, ctx) => buildPropertyConditionSubquery(cond, ctx),
  event:           (cond, ctx) => buildEventConditionSubquery(cond, ctx),
  cohort:          (cond, ctx, resolve) => buildCohortRefConditionSubquery(cond, ctx, resolve),
  first_time_event:             (cond, ctx) => buildFirstTimeEventSubquery(cond, ctx),
  not_performed_event:          (cond, ctx) => buildNotPerformedEventSubquery(cond, ctx),
  event_sequence:               (cond, ctx) => buildEventSequenceSubquery(cond, ctx),
  performed_regularly:          (cond, ctx) => buildPerformedRegularlySubquery(cond, ctx),
  stopped_performing:           (cond, ctx) => buildStoppedPerformingSubquery(cond, ctx),
  restarted_performing:         (cond, ctx) => buildRestartedPerformingSubquery(cond, ctx),
  not_performed_event_sequence: (cond, ctx) => buildNotPerformedEventSequenceSubquery(cond, ctx),
};

// Single condition dispatch

function buildConditionSubquery(
  cond: CohortCondition,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): SelectNode {
  const builder = CONDITION_BUILDERS[cond.type] as ConditionBuilder;
  if (!builder) {
    throw new Error(`Unknown condition type: ${(cond as { type: string }).type}`);
  }
  return builder(cond, ctx, resolveCohortIsStatic);
}

// Recursive group builder

/**
 * Builds a QueryNode returning person_ids matching a nested AND/OR group.
 * AND groups use INTERSECT, OR groups use UNION DISTINCT.
 */
function buildGroupSubquery(
  group: CohortConditionGroup,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): QueryNode {
  if (group.values.length === 0) {
    return select(toUUID(literal('00000000-0000-0000-0000-000000000000')).as('person_id'))
      .where(literal(0))
      .build();
  }

  const subqueries: QueryNode[] = [];
  for (const val of group.values) {
    if (isConditionGroup(val)) {
      subqueries.push(buildGroupSubquery(val, ctx, resolveCohortIsStatic));
    } else {
      subqueries.push(buildConditionSubquery(val, ctx, resolveCohortIsStatic));
    }
  }

  if (subqueries.length === 1) {
    return subqueries[0];
  }

  return group.type === 'AND'
    ? intersect(...subqueries)
    : unionDistinct(...subqueries);
}

// Entry point

/**
 * Builds a QueryNode from a CohortConditionGroup definition.
 *
 * @param dateTo - Optional datetime string (e.g. "2025-01-31 23:59:59") used
 *   as the upper bound for behavioral conditions instead of `now()`.
 * @param dateFrom - Optional datetime string used as the lower bound for the
 *   `not_performed_event` condition.
 */
export function buildCohortSubquery(
  definition: CohortConditionGroup,
  cohortIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
  dateTo?: string,
  dateFrom?: string,
): QueryNode {
  validateDefinitionComplexity(definition);

  const ctx: BuildContext = {
    projectIdParam,
    queryParams,
    counter: { value: cohortIdx * 100 },
    dateTo,
    dateFrom,
  };
  return buildGroupSubquery(definition, ctx, resolveCohortIsStatic);
}

/**
 * Single source-of-truth for routing a cohort to the correct person_id subquery.
 *
 * - `is_static` -> `SELECT person_id FROM person_static_cohort FINAL WHERE ...`
 * - `materialized` -> `SELECT person_id FROM cohort_members FINAL WHERE ...`
 * - otherwise -> inline `buildCohortSubquery(definition, ...)`
 *
 * Returns a QueryNode that yields `person_id` rows.
 */
export function buildCohortMemberSubquery(
  input: CohortFilterInput,
  cohortParamKey: string,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
  subqueryOffset: number = 0,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
  dateTo?: string,
  dateFrom?: string,
): QueryNode {
  if (input.is_static) {
    queryParams[cohortParamKey] = input.cohort_id;
    return select(col('person_id'))
      .from('person_static_cohort FINAL')
      .where(
        eq(col('cohort_id'), namedParam(cohortParamKey, 'UUID', input.cohort_id)),
        eq(col('project_id'), namedParam(projectIdParam, 'UUID', queryParams[projectIdParam])),
      )
      .build();
  }
  if (input.materialized) {
    queryParams[cohortParamKey] = input.cohort_id;
    return select(col('person_id'))
      .from('cohort_members FINAL')
      .where(
        eq(col('cohort_id'), namedParam(cohortParamKey, 'UUID', input.cohort_id)),
        eq(col('project_id'), namedParam(projectIdParam, 'UUID', queryParams[projectIdParam])),
      )
      .build();
  }
  return buildCohortSubquery(
    input.definition, subqueryOffset, projectIdParam, queryParams,
    resolveCohortIsStatic, dateTo, dateFrom,
  );
}

/**
 * Builds a WHERE clause Expr: `RESOLVED_PERSON IN (cohort subquery)` for each cohort.
 * Returns an Expr (ANDed together) or undefined if no cohorts.
 *
 * Uses pre-computed tables when materialized, inline subquery otherwise.
 * Delegates routing to `buildCohortMemberSubquery`.
 */
export function buildCohortFilterClause(
  cohorts: CohortFilterInput[],
  projectIdParam: string,
  queryParams: Record<string, unknown>,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
  dateTo?: string,
  dateFrom?: string,
): Expr | undefined {
  if (cohorts.length === 0) return undefined;

  const exprs: Expr[] = cohorts.map((c, idx) => {
    const paramKey = c.is_static ? `coh_sid_${idx}` : c.materialized ? `coh_mid_${idx}` : `coh_inline_${idx}`;
    const node = buildCohortMemberSubquery(
      c, paramKey, projectIdParam, queryParams, idx,
      resolveCohortIsStatic, dateTo, dateFrom,
    );
    return inSubquery(resolvedPerson(), node);
  });

  return exprs.length === 1 ? exprs[0] : and(...exprs);
}
