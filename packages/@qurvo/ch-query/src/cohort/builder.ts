import type { CohortCondition, CohortConditionGroup } from '@qurvo/db';
import { isConditionGroup } from '@qurvo/db';
import { RESOLVED_PERSON } from './helpers';
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

// ── Strategy registry ────────────────────────────────────────────────────────

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
) => string;

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

// ── Single condition dispatch ────────────────────────────────────────────────

function buildConditionSubquery(
  cond: CohortCondition,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): string {
  const builder = CONDITION_BUILDERS[cond.type] as ConditionBuilder;
  if (!builder) {
    throw new Error(`Unknown condition type: ${(cond as { type: string }).type}`);
  }
  return builder(cond, ctx, resolveCohortIsStatic);
}

// ── Recursive group builder ──────────────────────────────────────────────────

/**
 * Builds a subquery returning person_ids matching a nested AND/OR group.
 * AND groups use INTERSECT, OR groups use UNION DISTINCT.
 */
function buildGroupSubquery(
  group: CohortConditionGroup,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): string {
  if (group.values.length === 0) {
    return `SELECT toUUID('00000000-0000-0000-0000-000000000000') AS person_id WHERE 0`;
  }

  const subqueries: string[] = [];
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

  const joiner = group.type === 'AND' ? 'INTERSECT' : 'UNION DISTINCT';
  return subqueries.join(`\n${joiner}\n`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Builds a subquery from a CohortConditionGroup definition.
 *
 * @param dateTo - Optional datetime string (e.g. "2025-01-31 23:59:59") used
 *   as the upper bound for behavioral conditions instead of `now()`.  Pass the
 *   funnel/trend `date_to` value here to ensure historical queries are
 *   reproducible and cache-coherent.
 * @param dateFrom - Optional datetime string used as the lower bound for the
 *   `not_performed_event` condition.  When provided together with `dateTo`, the
 *   absence check is scoped to the exact `[dateFrom, dateTo]` analysis window
 *   rather than the rolling `[dateTo - N days, dateTo]` window.  Pass the
 *   funnel/trend `date_from` value here to avoid false-negative exclusions when
 *   a user performed the target event before the analysis period began.
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
  // Defence-in-depth: reject overly complex definitions before generating SQL.
  // The API layer also validates via CohortsService, but this guard protects
  // any caller of the library (e.g. cohort-worker) that bypasses the API DTO layer.
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

// ── Filter clause builder ────────────────────────────────────────────────────

/**
 * Builds a WHERE clause fragment: `RESOLVED_PERSON IN (cohort subquery)`.
 * Uses pre-computed tables when materialized, inline subquery otherwise.
 *
 * @param dateTo - Optional datetime string used as the upper bound for
 *   behavioral conditions instead of `now()`.  Pass the funnel/trend `date_to`
 *   value here to ensure historical queries are reproducible.
 * @param dateFrom - Optional datetime string used as the lower bound for the
 *   `not_performed_event` condition.  When provided together with `dateTo`, the
 *   absence check is scoped to the exact `[dateFrom, dateTo]` analysis window.
 *   Pass the funnel/trend `date_from` value here to avoid false-negative
 *   exclusions when a user performed the target event before the analysis period.
 */
export function buildCohortFilterClause(
  cohorts: CohortFilterInput[],
  projectIdParam: string,
  queryParams: Record<string, unknown>,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
  dateTo?: string,
  dateFrom?: string,
): string {
  if (cohorts.length === 0) return '';

  const clauses = cohorts.map((c, idx) => {
    if (c.materialized) {
      const idParam = `coh_mid_${idx}`;
      queryParams[idParam] = c.cohort_id;
      return `${RESOLVED_PERSON} IN (
        SELECT person_id FROM cohort_members FINAL
        WHERE cohort_id = {${idParam}:UUID} AND project_id = {${projectIdParam}:UUID}
      )`;
    }
    if (c.is_static) {
      const idParam = `coh_sid_${idx}`;
      queryParams[idParam] = c.cohort_id;
      return `${RESOLVED_PERSON} IN (
        SELECT person_id FROM person_static_cohort FINAL
        WHERE cohort_id = {${idParam}:UUID} AND project_id = {${projectIdParam}:UUID}
      )`;
    }
    const subquery = buildCohortSubquery(c.definition, idx, projectIdParam, queryParams, resolveCohortIsStatic, dateTo, dateFrom);
    return `${RESOLVED_PERSON} IN (${subquery})`;
  });

  return clauses.join(' AND ');
}
