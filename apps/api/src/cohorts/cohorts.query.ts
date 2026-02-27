import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortConditionGroup } from '@qurvo/db';
import { buildCohortSubquery } from '@qurvo/cohort-query';

export interface CohortHistoryPoint {
  date: string;
  count: number;
}

// ── Counting helpers ─────────────────────────────────────────────────────────

async function queryCount(
  ch: ClickHouseClient,
  query: string,
  query_params: Record<string, unknown>,
): Promise<number> {
  const result = await ch.query({ query, query_params, format: 'JSONEachRow' });
  const rows = await result.json<{ cnt: string }>();
  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Counts the number of unique persons matching a cohort definition (inline).
 *
 * @param resolveCohortIsStatic - Optional callback that returns whether a
 *   referenced cohort ID is static. Used when the definition contains nested
 *   `{ type: 'cohort', cohort_id }` conditions and the `is_static` flag has
 *   not already been enriched on those conditions by the service layer.
 */
export async function countCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  definition: CohortConditionGroup,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): Promise<number> {
  const params: Record<string, unknown> = { project_id: projectId };
  const subquery = buildCohortSubquery(definition, 0, 'project_id', params, resolveCohortIsStatic);
  return queryCount(ch, `SELECT uniqExact(person_id) AS cnt FROM (${subquery})`, params);
}

/**
 * Counts unique persons from pre-computed cohort_members table.
 */
export async function countCohortMembersFromTable(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
): Promise<number> {
  return queryCount(ch, `
    SELECT uniqExact(person_id) AS cnt
    FROM cohort_members FINAL
    WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`,
    { project_id: projectId, cohort_id: cohortId },
  );
}

/**
 * Counts unique persons from person_static_cohort table.
 */
export async function countStaticCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
): Promise<number> {
  return queryCount(ch, `
    SELECT uniqExact(person_id) AS cnt
    FROM person_static_cohort FINAL
    WHERE project_id = {project_id:UUID} AND cohort_id = {cohort_id:UUID}`,
    { project_id: projectId, cohort_id: cohortId },
  );
}

/**
 * Queries cohort size history from cohort_membership_history table.
 * Returns daily points sorted ascending by date.
 */
export async function queryCohortSizeHistory(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
  days: number,
): Promise<CohortHistoryPoint[]> {
  const sql = `
    SELECT
      toString(h.date) AS date,
      h.count AS count
    FROM cohort_membership_history AS h FINAL
    WHERE h.project_id = {project_id:UUID}
      AND h.cohort_id = {cohort_id:UUID}
      AND h.date >= today() - {days:UInt32}
    ORDER BY h.date ASC`;

  const result = await ch.query({
    query: sql,
    query_params: { project_id: projectId, cohort_id: cohortId, days },
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ date: string; count: string }>();
  return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
}
