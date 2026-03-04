import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import {
  select,
  col,
  namedParam,
  eq,
  unionDistinct,
} from '@qurvo/ch-query';
import { inArray } from 'drizzle-orm';
import { cohorts, type Database } from '@qurvo/db';

export interface PersonCohortRow {
  cohort_id: string;
  name: string;
  is_static: boolean;
}

/**
 * Queries all cohort IDs the person belongs to from both
 * `cohort_members FINAL` (dynamic) and `person_static_cohort FINAL` (static),
 * then enriches them with cohort names from PostgreSQL.
 */
export async function queryPersonCohorts(
  ch: ClickHouseClient,
  db: Database,
  projectId: string,
  personId: string,
): Promise<PersonCohortRow[]> {
  // Step 1: Get all cohort_ids from ClickHouse (dynamic + static)
  const dynamicQuery = select(col('cohort_id'))
    .from('cohort_members').final()
    .where(
      eq(col('project_id'), namedParam('project_id', 'UUID', projectId)),
      eq(col('person_id'), namedParam('person_id', 'UUID', personId)),
    )
    .build();

  const staticQuery = select(col('cohort_id'))
    .from('person_static_cohort').final()
    .where(
      eq(col('project_id'), namedParam('s_project_id', 'UUID', projectId)),
      eq(col('person_id'), namedParam('s_person_id', 'UUID', personId)),
    )
    .build();

  const combined = unionDistinct(dynamicQuery, staticQuery);

  const rows = await new ChQueryExecutor(ch).rows<{ cohort_id: string }>(combined);

  if (rows.length === 0) {return [];}

  // Step 2: Enrich with cohort names from PostgreSQL
  const cohortIds = rows.map((r) => r.cohort_id);

  const pgRows = await db
    .select({
      id: cohorts.id,
      name: cohorts.name,
      is_static: cohorts.is_static,
    })
    .from(cohorts)
    .where(inArray(cohorts.id, cohortIds));

  return pgRows.map((c) => ({
    cohort_id: c.id,
    name: c.name,
    is_static: c.is_static,
  }));
}
