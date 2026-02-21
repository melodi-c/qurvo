import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortDefinition } from '@qurvo/db';
import { buildCohortFilterClause } from '../cohorts/cohorts.query';
import { toChTs, RESOLVED_PERSON } from '../utils/clickhouse-helpers';

function granularityTruncExpr(granularity: LifecycleGranularity, col: string): string {
  switch (granularity) {
    case 'day': return `toStartOfDay(${col})`;
    case 'week': return `toStartOfWeek(${col}, 1)`;
    case 'month': return `toStartOfMonth(${col})`;
  }
}

function extendDateBack(date: string, granularity: LifecycleGranularity): string {
  const d = new Date(`${date}T00:00:00Z`);
  switch (granularity) {
    case 'day':
      d.setUTCDate(d.getUTCDate() - 1);
      break;
    case 'week':
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

function granularityAddInterval(granularity: LifecycleGranularity): string {
  switch (granularity) {
    case 'day': return `INTERVAL 1 DAY`;
    case 'week': return `INTERVAL 7 DAY`;
    case 'month': return `INTERVAL 1 MONTH`;
  }
}

function granularitySubInterval(granularity: LifecycleGranularity): string {
  switch (granularity) {
    case 'day': return `INTERVAL 1 DAY`;
    case 'week': return `INTERVAL 7 DAY`;
    case 'month': return `INTERVAL 1 MONTH`;
  }
}

// ── Public types ─────────────────────────────────────────────────────────────

export type LifecycleGranularity = 'day' | 'week' | 'month';
export type LifecycleStatus = 'new' | 'returning' | 'resurrecting' | 'dormant';

export interface LifecycleQueryParams {
  project_id: string;
  target_event: string;
  granularity: LifecycleGranularity;
  date_from: string;
  date_to: string;
  cohort_filters?: CohortDefinition[];
}

export interface LifecycleDataPoint {
  bucket: string;
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export interface LifecycleQueryResult {
  granularity: LifecycleGranularity;
  data: LifecycleDataPoint[];
  totals: {
    new: number;
    returning: number;
    resurrecting: number;
    dormant: number;
  };
}

// ── Raw row type ─────────────────────────────────────────────────────────────

interface RawLifecycleRow {
  period: string;
  status: string;
  count: string;
}

// ── Result assembly ──────────────────────────────────────────────────────────

function assembleLifecycleResult(
  rows: RawLifecycleRow[],
  granularity: LifecycleGranularity,
): LifecycleQueryResult {
  const bucketMap = new Map<string, LifecycleDataPoint>();

  for (const row of rows) {
    const bucket = row.period;
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, { bucket, new: 0, returning: 0, resurrecting: 0, dormant: 0 });
    }
    const point = bucketMap.get(bucket)!;
    const count = Number(row.count);
    const status = row.status as LifecycleStatus;
    if (status === 'dormant') {
      point.dormant = -Math.abs(count);
    } else {
      point[status] = count;
    }
  }

  const data = [...bucketMap.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));

  const totals = { new: 0, returning: 0, resurrecting: 0, dormant: 0 };
  for (const point of data) {
    totals.new += point.new;
    totals.returning += point.returning;
    totals.resurrecting += point.resurrecting;
    totals.dormant += point.dormant;
  }

  return { granularity, data, totals };
}

// ── Core query ───────────────────────────────────────────────────────────────
//
// ClickHouse CTEs are inlined (not materialised), so window-function approaches
// suffer from predicate push-down that corrupts lag/lead results.
// We use IN / NOT IN sub-queries instead — ClickHouse builds a hash set once
// per sub-query, giving O(N) lookup with no self-join NULL-default pitfalls.

export async function queryLifecycle(
  ch: ClickHouseClient,
  params: LifecycleQueryParams,
): Promise<LifecycleQueryResult> {
  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    target_event: params.target_event,
  };

  const extendedFrom = extendDateBack(params.date_from, params.granularity);
  queryParams['extended_from'] = toChTs(extendedFrom);
  queryParams['from'] = toChTs(params.date_from);
  queryParams['to'] = toChTs(params.date_to, true);

  const granExpr = granularityTruncExpr(params.granularity, 'timestamp');
  const addInterval = granularityAddInterval(params.granularity);
  const subInterval = granularitySubInterval(params.granularity);

  const cohortClause = params.cohort_filters?.length
    ? ' AND ' + buildCohortFilterClause(params.cohort_filters, 'project_id', queryParams)
    : '';

  const sql = `
    WITH
      active_periods AS (
        SELECT ${RESOLVED_PERSON} AS person_id, ${granExpr} AS ts_bucket
        FROM events FINAL
        WHERE project_id = {project_id:UUID}
          AND event_name = {target_event:String}
          AND timestamp >= {extended_from:DateTime64(3)}
          AND timestamp <= {to:DateTime64(3)}${cohortClause}
        GROUP BY person_id, ts_bucket
      ),
      first_activity AS (
        SELECT person_id, min(ts_bucket) AS first_bucket
        FROM active_periods
        GROUP BY person_id
      ),
      classified AS (
        SELECT
          a.ts_bucket AS ts_bucket,
          multiIf(
            a.ts_bucket = f.first_bucket, 'new',
            (a.person_id, a.ts_bucket - ${subInterval}) IN (SELECT person_id, ts_bucket FROM active_periods), 'returning',
            'resurrecting'
          ) AS status,
          a.person_id AS person_id
        FROM active_periods a
        INNER JOIN first_activity f ON a.person_id = f.person_id
        WHERE a.ts_bucket >= {from:DateTime64(3)}
      ),
      dormant AS (
        SELECT
          a.ts_bucket + ${addInterval} AS ts_bucket,
          'dormant' AS status,
          a.person_id
        FROM active_periods a
        WHERE (a.person_id, a.ts_bucket + ${addInterval}) NOT IN (SELECT person_id, ts_bucket FROM active_periods)
          AND a.ts_bucket + ${addInterval} >= {from:DateTime64(3)}
          AND a.ts_bucket + ${addInterval} <= {to:DateTime64(3)}
      )
    SELECT
      toString(ts_bucket) AS period,
      status,
      uniqExact(person_id) AS count
    FROM (
      SELECT ts_bucket, status, person_id FROM classified
      UNION ALL
      SELECT ts_bucket, status, person_id FROM dormant
    )
    GROUP BY ts_bucket, status
    ORDER BY ts_bucket ASC, status ASC`;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawLifecycleRow>();
  return assembleLifecycleResult(rows, params.granularity);
}
