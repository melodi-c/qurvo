import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortConditionGroup } from '@qurvo/db';
import { buildCohortSubquery } from '@qurvo/cohort-query';

// Re-export for backward compat with insight query files
export { buildCohortFilterClause } from '@qurvo/cohort-query';
export type { CohortFilterInput } from '@qurvo/cohort-query';

// ── Counting helpers ─────────────────────────────────────────────────────────

/**
 * Counts the number of unique persons matching a cohort definition (inline).
 */
export async function countCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  definition: CohortConditionGroup,
): Promise<number> {
  const queryParams: Record<string, unknown> = { project_id: projectId };
  const subquery = buildCohortSubquery(definition, 0, 'project_id', queryParams);

  const sql = `SELECT uniqExact(person_id) AS cnt FROM (${subquery})`;
  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<{ cnt: string }>();
  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Counts unique persons from pre-computed cohort_members table.
 */
export async function countCohortMembersFromTable(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
): Promise<number> {
  const sql = `
    SELECT uniqExact(person_id) AS cnt
    FROM cohort_members FINAL
    WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`;
  const result = await ch.query({
    query: sql,
    query_params: { project_id: projectId, cohort_id: cohortId },
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ cnt: string }>();
  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Counts unique persons from person_static_cohort table.
 */
export async function countStaticCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
): Promise<number> {
  const sql = `
    SELECT uniqExact(person_id) AS cnt
    FROM person_static_cohort FINAL
    WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`;
  const result = await ch.query({
    query: sql,
    query_params: { project_id: projectId, cohort_id: cohortId },
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ cnt: string }>();
  return Number(rows[0]?.cnt ?? 0);
}
