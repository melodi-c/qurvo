import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { toChTs, RESOLVED_PERSON, granularityTruncExpr, buildCohortClause, shiftDate, truncateDate, buildFilterClause } from '../../utils/clickhouse-helpers';
import { buildPropertyFilterConditions, type PropertyFilter } from '../../utils/property-filter';

// ── Public types ─────────────────────────────────────────────────────────────

export type RetentionType = 'first_time' | 'recurring';
export type RetentionGranularity = 'day' | 'week' | 'month';

export interface RetentionQueryParams {
  project_id: string;
  target_event: string;
  retention_type: RetentionType;
  granularity: RetentionGranularity;
  periods: number;
  date_from: string;
  date_to: string;
  filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
}

export interface RetentionCohort {
  cohort_date: string;
  cohort_size: number;
  periods: number[];
}

export interface RetentionQueryResult {
  retention_type: RetentionType;
  granularity: RetentionGranularity;
  cohorts: RetentionCohort[];
  average_retention: number[];
}

// ── Raw row type ─────────────────────────────────────────────────────────────

interface RawRetentionRow {
  cohort_period: string;
  period_offset: string;
  user_count: string;
}

// ── Result assembly ──────────────────────────────────────────────────────────

function assembleResult(
  rows: RawRetentionRow[],
  params: RetentionQueryParams,
): RetentionQueryResult {
  // Group by cohort_period
  const cohortMap = new Map<string, number[]>();
  for (const row of rows) {
    const key = row.cohort_period;
    if (!cohortMap.has(key)) {
      cohortMap.set(key, new Array(params.periods + 1).fill(0));
    }
    const offset = Number(row.period_offset);
    if (offset >= 0 && offset <= params.periods) {
      cohortMap.get(key)![offset] = Number(row.user_count);
    }
  }

  // Sort by date
  const sortedKeys = [...cohortMap.keys()].sort();
  const cohorts: RetentionCohort[] = sortedKeys.map((key) => ({
    cohort_date: key,
    cohort_size: cohortMap.get(key)![0],
    periods: cohortMap.get(key)!,
  }));

  // Compute weighted average retention % (weighted by cohort size)
  // sum(returned_at_offset) / sum(cohort_size) * 100
  const average_retention: number[] = [];
  for (let offset = 0; offset <= params.periods; offset++) {
    let totalReturned = 0;
    let totalSize = 0;
    for (const cohort of cohorts) {
      if (cohort.cohort_size > 0) {
        totalReturned += cohort.periods[offset];
        totalSize += cohort.cohort_size;
      }
    }
    average_retention.push(totalSize > 0 ? Math.round((totalReturned / totalSize) * 100 * 100) / 100 : 0);
  }

  return {
    retention_type: params.retention_type,
    granularity: params.granularity,
    cohorts,
    average_retention,
  };
}

// ── Core query ───────────────────────────────────────────────────────────────

export async function queryRetention(
  ch: ClickHouseClient,
  params: RetentionQueryParams,
): Promise<RetentionQueryResult> {
  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    target_event: params.target_event,
    periods: params.periods,
  };

  const truncFrom = truncateDate(params.date_from, params.granularity);
  const truncTo = truncateDate(params.date_to, params.granularity);
  const extendedTo = shiftDate(params.date_to, params.periods, params.granularity);

  queryParams['from'] = toChTs(truncFrom);
  queryParams['to'] = toChTs(truncTo, true);
  queryParams['extended_to'] = toChTs(extendedTo, true);

  const granExpr = granularityTruncExpr(params.granularity, 'timestamp');
  const unit = params.granularity;

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams);

  // Build event property filter conditions.
  // recurring: applied to both initial and return events.
  // first_time: applied to return events only — initial event search is unfiltered
  //   so that "first occurrence" means the true first event, not the first matching one.
  const filterParts = buildPropertyFilterConditions(params.filters ?? [], 'ret', queryParams);
  const filterClause = buildFilterClause(filterParts);

  let initialCte: string;

  if (params.retention_type === 'recurring') {
    // Recurring: each period the person is active counts as an initial event
    initialCte = `
      SELECT ${RESOLVED_PERSON} AS person_id, ${granExpr} AS cohort_period
      FROM events
      WHERE project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name = {target_event:String}${cohortClause}${filterClause}
      GROUP BY person_id, cohort_period`;
  } else {
    // First-time: only the first ever occurrence of the event, ignoring property
    // filters — filters must NOT affect which occurrence counts as "first".
    // Filters are applied only to return_events (see below).
    initialCte = `
      SELECT person_id, cohort_period
      FROM (
        SELECT ${RESOLVED_PERSON} AS person_id,
               min(${granExpr}) AS cohort_period
        FROM events
        WHERE project_id = {project_id:UUID}
          AND event_name = {target_event:String}${cohortClause}
        GROUP BY person_id
      )
      WHERE cohort_period >= {from:DateTime64(3)}
        AND cohort_period <= {to:DateTime64(3)}`;
  }

  const sql = `
    WITH
      initial_events AS (${initialCte}),
      return_events AS (
        SELECT ${RESOLVED_PERSON} AS person_id, ${granExpr} AS return_period
        FROM events
        WHERE project_id = {project_id:UUID}
          AND timestamp >= {from:DateTime64(3)}
          AND timestamp <= {extended_to:DateTime64(3)}
          AND event_name = {target_event:String}${cohortClause}${filterClause}
        GROUP BY person_id, return_period
      ),
      retention_raw AS (
        SELECT i.cohort_period,
               i.person_id,
               dateDiff('${unit}', i.cohort_period, r.return_period) AS period_offset
        FROM initial_events i
        INNER JOIN return_events r ON i.person_id = r.person_id
        WHERE r.return_period >= i.cohort_period
          AND dateDiff('${unit}', i.cohort_period, r.return_period) <= {periods:UInt32}
      )
    SELECT
      toString(cohort_period) AS cohort_period,
      period_offset,
      uniqExact(person_id) AS user_count
    FROM retention_raw
    GROUP BY cohort_period, period_offset
    ORDER BY cohort_period ASC, period_offset ASC`;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawRetentionRow>();
  return assembleResult(rows, params);
}
