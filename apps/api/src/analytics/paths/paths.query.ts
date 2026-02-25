import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { toChTs, RESOLVED_PERSON, buildCohortClause } from '../../utils/clickhouse-helpers';

// ── Public types ──────────────────────────────────────────────────────────────

export interface PathCleaningRule {
  regex: string;
  alias: string;
}

export interface WildcardGroup {
  pattern: string;
  alias: string;
}

export interface PathsQueryParams {
  project_id: string;
  date_from: string;
  date_to: string;
  step_limit: number;
  start_event?: string;
  end_event?: string;
  exclusions?: string[];
  min_persons?: number;
  path_cleaning_rules?: PathCleaningRule[];
  wildcard_groups?: WildcardGroup[];
  cohort_filters?: CohortFilterInput[];
}

export interface PathTransition {
  step: number;
  source: string;
  target: string;
  person_count: number;
}

export interface TopPath {
  path: string[];
  person_count: number;
}

export interface PathsQueryResult {
  transitions: PathTransition[];
  top_paths: TopPath[];
}

// ── Path cleaning expression ──────────────────────────────────────────────────

function buildCleaningExpr(
  rules?: PathCleaningRule[],
  wildcards?: WildcardGroup[],
): string {
  const arms: { pattern: string; alias: string }[] = [];

  if (wildcards?.length) {
    for (const wg of wildcards) {
      // Convert glob-style wildcard to regex: /product/* → ^/product/.*
      const regex = wg.pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      arms.push({ pattern: `^${regex}$`, alias: wg.alias });
    }
  }

  if (rules?.length) {
    for (const rule of rules) {
      arms.push({ pattern: rule.regex, alias: rule.alias });
    }
  }

  if (arms.length === 0) return 'event_name';

  const cases = arms
    .map((a) => `match(event_name, '${a.pattern.replace(/'/g, "\\'")}'), '${a.alias.replace(/'/g, "\\'")}'`)
    .join(', ');
  return `multiIf(${cases}, event_name)`;
}

// ── Raw row types ─────────────────────────────────────────────────────────────

interface RawTransitionRow {
  step: string;
  source: string;
  target: string;
  person_count: string;
}

interface RawTopPathRow {
  path: string[];
  person_count: string;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function queryPaths(
  ch: ClickHouseClient,
  params: PathsQueryParams,
): Promise<PathsQueryResult> {
  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    step_limit: params.step_limit,
  };

  const cleaningExpr = buildCleaningExpr(params.path_cleaning_rules, params.wildcard_groups);

  // Exclusions filter
  let exclusionClause = '';
  if (params.exclusions?.length) {
    queryParams['exclusions'] = params.exclusions;
    exclusionClause = ' AND event_name NOT IN ({exclusions:Array(String)})';
  }

  // Cohort filter
  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams);

  if (params.start_event) {
    queryParams['start_event'] = params.start_event;
  }

  if (params.end_event) {
    queryParams['end_event'] = params.end_event;
  }

  queryParams['min_persons'] = params.min_persons ?? 1;

  // Build the CTE for per-person paths
  const pathsCTE = `
    WITH ordered_events AS (
      SELECT
        ${RESOLVED_PERSON} AS pid,
        ${cleaningExpr} AS cleaned_name,
        timestamp
      FROM events FINAL
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}${exclusionClause}${cohortClause}
      ORDER BY pid, timestamp ASC
    ),
    person_paths AS (
      SELECT
        pid,
        arrayCompact(
          arraySlice(groupArray(cleaned_name), 1, toUInt16({step_limit:UInt8}))
        ) AS raw_path
      FROM ordered_events
      GROUP BY pid
      HAVING length(raw_path) >= 2
    ),
    trimmed_paths AS (
      SELECT
        pid,
        ${params.start_event
          ? `if(has(raw_path, {start_event:String}), arraySlice(raw_path, indexOf(raw_path, {start_event:String})), []) AS p1`
          : 'raw_path AS p1'}
      FROM person_paths
    ),
    final_paths AS (
      SELECT
        pid,
        ${params.end_event
          ? `if(has(p1, {end_event:String}), arraySlice(p1, 1, indexOf(p1, {end_event:String})), p1) AS path`
          : 'p1 AS path'}
      FROM trimmed_paths
      WHERE length(p1) >= 2
    )`;

  // Query 1: Transitions
  const transitionsSql = `
    ${pathsCTE}
    SELECT
      idx AS step,
      path[idx] AS source,
      path[idx + 1] AS target,
      uniqExact(pid) AS person_count
    FROM final_paths
    ARRAY JOIN arrayEnumerate(path) AS idx
    WHERE idx < length(path)
      AND idx <= {step_limit:UInt8}
    GROUP BY step, source, target
    HAVING person_count >= {min_persons:UInt32}
    ORDER BY step ASC, person_count DESC`;

  // Query 2: Top paths
  const topPathsSql = `
    ${pathsCTE}
    SELECT
      arraySlice(path, 1, {step_limit:UInt8}) AS path,
      uniqExact(pid) AS person_count
    FROM final_paths
    WHERE length(path) >= 2
    GROUP BY path
    HAVING person_count >= {min_persons:UInt32}
    ORDER BY person_count DESC
    LIMIT 20`;

  // Execute both queries in parallel
  const [transitionsResult, topPathsResult] = await Promise.all([
    ch.query({ query: transitionsSql, query_params: queryParams, format: 'JSONEachRow' }),
    ch.query({ query: topPathsSql, query_params: queryParams, format: 'JSONEachRow' }),
  ]);

  const transitionRows = await transitionsResult.json<RawTransitionRow>();
  const topPathRows = await topPathsResult.json<RawTopPathRow>();

  const transitions: PathTransition[] = transitionRows.map((r) => ({
    step: Number(r.step),
    source: r.source,
    target: r.target,
    person_count: Number(r.person_count),
  }));

  const top_paths: TopPath[] = topPathRows.map((r) => ({
    path: r.path,
    person_count: Number(r.person_count),
  }));

  return { transitions, top_paths };
}
