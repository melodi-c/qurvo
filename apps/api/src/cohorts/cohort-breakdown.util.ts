import { buildCohortSubquery } from '@qurvo/cohort-query';
import type { CohortConditionGroup } from '@qurvo/db';
import { RESOLVED_PERSON } from '../utils/clickhouse-helpers';

export interface CohortBreakdownEntry {
  cohort_id: string;
  name: string;
  is_static: boolean;
  materialized: boolean;
  definition: CohortConditionGroup;
}

/**
 * Builds the SQL predicate for filtering by a single cohort breakdown entry.
 * Returns a bare predicate (no leading " AND ") — callers prepend that themselves.
 *
 * Mutates queryParams with the cohort param key and any inline subquery params.
 */
export function buildCohortFilterForBreakdown(
  cb: CohortBreakdownEntry,
  paramKey: string,
  subqueryOffset: number,
  queryParams: Record<string, unknown>,
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
  const subquery = buildCohortSubquery(cb.definition, subqueryOffset, 'project_id', queryParams);
  return `${RESOLVED_PERSON} IN (${subquery})`;
}
