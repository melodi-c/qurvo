import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortDefinition, CohortCondition, CohortPropertyCondition, CohortEventCondition } from '@qurvo/db';
import { RESOLVED_PERSON } from '../utils/clickhouse-helpers';

// ── Materialized cohort filter input ─────────────────────────────────────────

export interface CohortFilterInput {
  cohort_id: string;
  definition: CohortDefinition;
  materialized: boolean;
}

// ── Cohort SQL builders ──────────────────────────────────────────────────────

const TOP_LEVEL_COLUMNS = new Set([
  'country', 'region', 'city', 'device_type', 'browser',
  'browser_version', 'os', 'os_version', 'language',
]);

function resolvePropertyExpr(property: string): string {
  if (TOP_LEVEL_COLUMNS.has(property)) {
    return `argMax(${property}, timestamp)`;
  }
  if (property.startsWith('properties.')) {
    const key = property.slice('properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(argMax(properties, timestamp), '${key}')`;
  }
  const key = property.startsWith('user_properties.')
    ? property.slice('user_properties.'.length)
    : property;
  return `JSONExtractString(argMax(user_properties, timestamp), '${key.replace(/'/g, "\\'")}')`;
}

function buildPropertyConditionSubquery(
  cond: CohortPropertyCondition,
  condIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  const pk = `coh_${condIdx}_v`;
  const latestExpr = resolvePropertyExpr(cond.property);

  let havingClause: string;
  switch (cond.operator) {
    case 'eq':
      queryParams[pk] = cond.value ?? '';
      havingClause = `${latestExpr} = {${pk}:String}`;
      break;
    case 'neq':
      queryParams[pk] = cond.value ?? '';
      havingClause = `${latestExpr} != {${pk}:String}`;
      break;
    case 'contains':
      queryParams[pk] = `%${cond.value ?? ''}%`;
      havingClause = `${latestExpr} LIKE {${pk}:String}`;
      break;
    case 'not_contains':
      queryParams[pk] = `%${cond.value ?? ''}%`;
      havingClause = `${latestExpr} NOT LIKE {${pk}:String}`;
      break;
    case 'is_set':
      havingClause = `${latestExpr} != ''`;
      break;
    case 'is_not_set':
      havingClause = `${latestExpr} = ''`;
      break;
    default:
      havingClause = '1';
  }

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE project_id = {${projectIdParam}:UUID}
    GROUP BY person_id
    HAVING ${havingClause}`;
}

function buildEventConditionSubquery(
  cond: CohortEventCondition,
  condIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  const eventPk = `coh_${condIdx}_event`;
  const countPk = `coh_${condIdx}_count`;
  const daysPk = `coh_${condIdx}_days`;

  queryParams[eventPk] = cond.event_name;
  queryParams[countPk] = cond.count;
  queryParams[daysPk] = cond.time_window_days;

  let countOp: string;
  switch (cond.count_operator) {
    case 'gte': countOp = '>='; break;
    case 'lte': countOp = '<='; break;
    case 'eq':  countOp = '=';  break;
  }

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE
      project_id = {${projectIdParam}:UUID}
      AND event_name = {${eventPk}:String}
      AND timestamp >= now() - INTERVAL {${daysPk}:UInt32} DAY
    GROUP BY person_id
    HAVING count() ${countOp} {${countPk}:UInt64}`;
}

function buildConditionSubquery(
  cond: CohortCondition,
  condIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  if (cond.type === 'person_property') {
    return buildPropertyConditionSubquery(cond, condIdx, projectIdParam, queryParams);
  }
  return buildEventConditionSubquery(cond, condIdx, projectIdParam, queryParams);
}

/**
 * Builds a complete subquery that returns all person_ids matching the cohort definition.
 * Uses INTERSECT ALL for "all" match, UNION for "any" match.
 */
export function buildCohortSubquery(
  definition: CohortDefinition,
  cohortIdx: number,
  projectIdParam: string,
  queryParams: Record<string, unknown>,
): string {
  if (definition.conditions.length === 0) {
    return `SELECT '' AS person_id WHERE 0`;
  }

  if (definition.conditions.length === 1) {
    return buildConditionSubquery(definition.conditions[0], cohortIdx * 100, projectIdParam, queryParams);
  }

  const joiner = definition.match === 'all' ? 'INTERSECT' : 'UNION ALL';
  const subqueries = definition.conditions.map((cond, i) =>
    buildConditionSubquery(cond, cohortIdx * 100 + i, projectIdParam, queryParams),
  );

  return subqueries.join(`\n${joiner}\n`);
}

// ── Filter clause builder ────────────────────────────────────────────────────

/**
 * Builds a WHERE clause fragment: `RESOLVED_PERSON IN (cohort subquery)`.
 * Uses pre-computed cohort_members table when materialized, inline subquery otherwise.
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
    const subquery = buildCohortSubquery(c.definition, idx, projectIdParam, queryParams);
    return `${RESOLVED_PERSON} IN (${subquery})`;
  });

  return clauses.join(' AND ');
}

// ── Counting helpers ─────────────────────────────────────────────────────────

/**
 * Counts the number of unique persons matching a cohort definition (inline).
 */
export async function countCohortMembers(
  ch: ClickHouseClient,
  projectId: string,
  definition: CohortDefinition,
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
