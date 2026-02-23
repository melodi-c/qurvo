import type { CohortCondition, CohortConditionGroup, CohortDefinition, CohortDefinitionV2 } from '@qurvo/db';
import { isConditionGroup, normalizeDefinition } from '@qurvo/db';
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

// ── Single condition dispatch ────────────────────────────────────────────────

function buildConditionSubquery(
  cond: CohortCondition,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): string {
  switch (cond.type) {
    case 'person_property':
      return buildPropertyConditionSubquery(cond, ctx);
    case 'event':
      return buildEventConditionSubquery(cond, ctx);
    case 'cohort':
      return buildCohortRefConditionSubquery(cond, ctx, resolveCohortIsStatic);
    case 'first_time_event':
      return buildFirstTimeEventSubquery(cond, ctx);
    case 'not_performed_event':
      return buildNotPerformedEventSubquery(cond, ctx);
    case 'event_sequence':
      return buildEventSequenceSubquery(cond, ctx);
    case 'performed_regularly':
      return buildPerformedRegularlySubquery(cond, ctx);
    case 'stopped_performing':
      return buildStoppedPerformingSubquery(cond, ctx);
    case 'restarted_performing':
      return buildRestartedPerformingSubquery(cond, ctx);
  }
}

// ── Recursive group builder ──────────────────────────────────────────────────

/**
 * Builds a subquery returning person_ids matching a nested AND/OR group.
 * AND groups use INTERSECT, OR groups use UNION ALL.
 */
export function buildGroupSubquery(
  group: CohortConditionGroup,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): string {
  if (group.values.length === 0) {
    return `SELECT '' AS person_id WHERE 0`;
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

  const joiner = group.type === 'AND' ? 'INTERSECT' : 'UNION ALL';
  return subqueries.join(`\n${joiner}\n`);
}

// ── Legacy-compatible entry point ────────────────────────────────────────────

/**
 * Builds a subquery from either V1 or V2 definition.
 * Accepts the same counter-based context as the old API for backward compat.
 */
export function buildCohortSubquery(
  definition: CohortDefinition | CohortDefinitionV2,
  cohortIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): string {
  const v2 = normalizeDefinition(definition);
  const ctx: BuildContext = {
    projectIdParam,
    queryParams,
    counter: { value: cohortIdx * 100 },
  };
  return buildGroupSubquery(v2, ctx, resolveCohortIsStatic);
}

// ── Filter clause builder ────────────────────────────────────────────────────

/**
 * Builds a WHERE clause fragment: `RESOLVED_PERSON IN (cohort subquery)`.
 * Uses pre-computed tables when materialized, inline subquery otherwise.
 */
export function buildCohortFilterClause(
  cohorts: CohortFilterInput[],
  projectIdParam: string,
  queryParams: Record<string, unknown>,
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
    const subquery = buildCohortSubquery(c.definition, idx, projectIdParam, queryParams);
    return `${RESOLVED_PERSON} IN (${subquery})`;
  });

  return clauses.join(' AND ');
}
