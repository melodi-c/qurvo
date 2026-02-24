import type { ClickHouseClient } from '@qurvo/clickhouse';

export async function getCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
): Promise<string[]> {
  const result = await ch.query({
    query: `SELECT DISTINCT person_id
            FROM cohort_members FINAL
            WHERE project_id = {p:UUID} AND cohort_id = {c:UUID} AND version > 0`,
    query_params: { p: projectId, c: cohortId },
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ person_id: string }>();
  return rows.map((r) => r.person_id);
}
