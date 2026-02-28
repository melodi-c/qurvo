import { buildCohortSubquery } from '@qurvo/cohort-query';
import { compile } from '@qurvo/ch-query';
import type { CohortConditionGroup } from '@qurvo/db';
import { RESOLVED_PERSON } from '../utils/clickhouse-helpers';

export interface CohortBreakdownEntry {
  cohort_id: string;
  name: string;
  is_static: boolean;
  materialized: boolean;
  definition: CohortConditionGroup;
  /**
   * Monotonically-increasing version token for materialized cohorts.
   * Included in the cache key so that cohort-worker recomputation automatically
   * invalidates any cached analytics result that used this cohort as a breakdown.
   * Undefined / null for inline (non-materialized, non-static) cohorts.
   */
  membership_version?: number | null;
}

/**
 * Builds the SQL predicate for filtering by a single cohort breakdown entry.
 * Returns a bare predicate (no leading " AND ") — callers prepend that themselves.
 *
 * Mutates queryParams with the cohort param key and any inline subquery params.
 *
 * @param dateTo - Optional datetime string (e.g. "2025-01-31 23:59:59") used as
 *   the upper bound for behavioral conditions instead of `now()`.
 * @param dateFrom - Optional datetime string used as the lower bound for the
 *   `not_performed_event` condition. When provided together with `dateTo`, the
 *   absence check is scoped to the exact `[dateFrom, dateTo]` analysis window
 *   rather than the rolling `[dateTo - N days, dateTo]` window.
 */
export function buildCohortFilterForBreakdown(
  cb: CohortBreakdownEntry,
  paramKey: string,
  subqueryOffset: number,
  queryParams: Record<string, unknown>,
  dateTo?: string,
  dateFrom?: string,
): string {
  queryParams[paramKey] = cb.cohort_id;

  if (cb.is_static) {
    return `${RESOLVED_PERSON} IN (
          SELECT person_id FROM person_static_cohort FINAL
          WHERE cohort_id = {${paramKey}:UUID} AND project_id = {project_id:UUID}
        )`;
  }
  if (cb.materialized) {
    return `${RESOLVED_PERSON} IN (
          SELECT person_id FROM cohort_members FINAL
          WHERE cohort_id = {${paramKey}:UUID} AND project_id = {project_id:UUID}
        )`;
  }
  const node = buildCohortSubquery(cb.definition, subqueryOffset, 'project_id', queryParams, undefined, dateTo, dateFrom);
  const { sql: subquery, params: compiledParams } = compile(node);
  Object.assign(queryParams, compiledParams);
  return `${RESOLVED_PERSON} IN (${subquery})`;
}
