import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortConditionGroup } from '@qurvo/db';
import { buildCohortSubquery } from '@qurvo/cohort-query';

export async function materializeCohort(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
  definition: CohortConditionGroup,
): Promise<number> {
  const version = Date.now();
  const queryParams: Record<string, unknown> = { project_id: projectId };
  const subquery = buildCohortSubquery(definition, 0, 'project_id', queryParams);

  const insertSql = `
    INSERT INTO cohort_members (cohort_id, project_id, person_id, version)
    SELECT
      '${cohortId}' AS cohort_id,
      '${projectId}' AS project_id,
      person_id,
      ${version} AS version
    FROM (${subquery})`;

  await ch.query({ query: insertSql, query_params: queryParams });
  return version;
}

export async function insertStaticCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  cohortId: string,
  personIds: string[],
): Promise<void> {
  if (personIds.length === 0) {return;}
  await ch.insert({
    table: 'person_static_cohort',
    values: personIds.map((pid) => ({
      project_id: projectId,
      cohort_id: cohortId,
      person_id: pid,
    })),
    format: 'JSONEachRow',
    clickhouse_settings: { async_insert: 0 },
  });
}
