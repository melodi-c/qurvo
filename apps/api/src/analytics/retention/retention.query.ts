import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { toChTs, RESOLVED_PERSON, granularityTruncExpr, granularityTruncMinExpr, buildCohortClause, shiftDate, truncateDate, buildFilterClause, tsExpr } from '../../utils/clickhouse-helpers';
import { buildPropertyFilterConditions, type PropertyFilter } from '../../utils/property-filter';

// ── Public types ─────────────────────────────────────────────────────────────

export type RetentionType = 'first_time' | 'recurring';
export type RetentionGranularity = 'day' | 'week' | 'month';

export interface RetentionQueryParams {
  project_id: string;
  target_event: string;
  /** Optional separate event to track as the return event. Defaults to target_event when omitted. */
  return_event?: string;
  retention_type: RetentionType;
  granularity: RetentionGranularity;
  periods: number;
  date_from: string;
  date_to: string;
  filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
  timezone?: string;
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
  const hasTz = !!(params.timezone && params.timezone !== 'UTC');
  // When return_event is specified, use it for the return CTE; otherwise default to target_event.
  const returnEventName = params.return_event ?? params.target_event;
  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    target_event: params.target_event,
    return_event: returnEventName,
    periods: params.periods,
  };
  if (hasTz) queryParams['tz'] = params.timezone;

  const truncFrom = truncateDate(params.date_from, params.granularity);
  const truncTo = truncateDate(params.date_to, params.granularity);
  const extendedTo = shiftDate(truncTo, params.periods, params.granularity);

  queryParams['from'] = toChTs(truncFrom, false, params.timezone);
  queryParams['to'] = toChTs(truncTo, true, params.timezone);
  queryParams['extended_to'] = toChTs(extendedTo, true, params.timezone);

  const fromExpr = tsExpr('from', 'tz', hasTz);
  const toExpr = tsExpr('to', 'tz', hasTz);
  const extendedToExpr = tsExpr('extended_to', 'tz', hasTz);
  const granExpr = granularityTruncExpr(params.granularity, 'timestamp', params.timezone);
  const unit = params.granularity;

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams, toChTs(params.date_to, true));

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
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        AND event_name = {target_event:String}${cohortClause}${filterClause}
      GROUP BY person_id, cohort_period`;
  } else {
    // First-time: only the first ever occurrence of the event counts as the cohort date.
    // Property filters are NOT applied here — the cohort date is the true first event,
    // regardless of its properties. Filters are applied only to return_events (see below).
    //
    // Performance note: we cannot safely add a lower-bound timestamp filter to this scan.
    // A user whose very first event predates date_from must be EXCLUDED from the cohort
    // (their min(timestamp) < date_from → the outer HAVING filters them out). But adding
    // `AND timestamp >= date_from` to the WHERE clause would hide their pre-date_from events,
    // making min(timestamp) appear to be >= date_from — which would incorrectly include
    // them as "new" users. The full history scan is therefore semantically necessary.
    //
    // Optimisation path: migration 0008 adds an aggregate projection
    // `events_person_min_timestamp (project_id, event_name, person_id, min(timestamp))`.
    // The HAVING clause uses `min(timestamp)` directly (rather than filtering on the
    // computed granularity bucket) so ClickHouse can read precomputed per-person
    // minimums from the projection instead of scanning all rows.
    // `cohort_period` is expressed as `granExpr(min(timestamp))` — equivalent to
    // `min(granExpr(timestamp))` by monotonicity of all supported truncation functions.
    //
    // Caveat: when RESOLVED_PERSON (coalesce(dictGetOrNull(..., distinct_id), person_id))
    // is used as the GROUP BY key, ClickHouse's optimizer may not automatically recognise
    // it as equivalent to the raw `person_id` column used in the projection key. The
    // projection still eliminates the per-row read by compressing many events into a single
    // aggregate row per (project_id, event_name, person_id), improving I/O significantly
    // even when full equivalence detection is unavailable.
    const granMinExpr = granularityTruncMinExpr(params.granularity, 'timestamp', params.timezone);
    initialCte = `
      SELECT ${RESOLVED_PERSON} AS person_id,
             ${granMinExpr} AS cohort_period
      FROM events
      WHERE project_id = {project_id:UUID}
        AND event_name = {target_event:String}${cohortClause}
      GROUP BY person_id
      HAVING min(timestamp) >= ${fromExpr}
         AND min(timestamp) <= ${toExpr}`;
  }

  const sql = `
    WITH
      initial_events AS (${initialCte}),
      return_events AS (
        SELECT ${RESOLVED_PERSON} AS person_id, ${granExpr} AS return_period
        FROM events
        WHERE project_id = {project_id:UUID}
          AND timestamp >= ${fromExpr}
          AND timestamp <= ${extendedToExpr}
          AND event_name = {return_event:String}${cohortClause}${filterClause}
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
