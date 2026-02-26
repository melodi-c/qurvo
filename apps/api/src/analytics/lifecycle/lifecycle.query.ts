import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { toChTs, RESOLVED_PERSON, granularityTruncExpr, buildCohortClause, shiftDate, granularityInterval, buildFilterClause } from '../../utils/clickhouse-helpers';
import { buildPropertyFilterConditions, type PropertyFilter } from '../../utils/property-filter';

// ── Public types ─────────────────────────────────────────────────────────────

export type LifecycleGranularity = 'day' | 'week' | 'month';
export type LifecycleStatus = 'new' | 'returning' | 'resurrecting' | 'dormant';

export interface LifecycleQueryParams {
  project_id: string;
  target_event: string;
  granularity: LifecycleGranularity;
  date_from: string;
  date_to: string;
  event_filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
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
// Single-scan approach: collect per-person active buckets into a sorted array,
// then ARRAY JOIN + has() to classify each bucket. This avoids CTE inlining
// that previously caused 5x table scans (ClickHouse CTEs are not materialised).

export async function queryLifecycle(
  ch: ClickHouseClient,
  params: LifecycleQueryParams,
): Promise<LifecycleQueryResult> {
  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    target_event: params.target_event,
  };

  const extendedFrom = shiftDate(params.date_from, -1, params.granularity);
  queryParams['extended_from'] = toChTs(extendedFrom);
  queryParams['from'] = toChTs(params.date_from);
  queryParams['to'] = toChTs(params.date_to, true);

  const granExpr = granularityTruncExpr(params.granularity, 'timestamp');
  const interval = granularityInterval(params.granularity);

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams);

  const eventFilterParts = buildPropertyFilterConditions(params.event_filters ?? [], 'lc', queryParams);
  const eventFilterClause = buildFilterClause(eventFilterParts);

  const sql = `
    WITH
      person_buckets AS (
        SELECT
          ${RESOLVED_PERSON} AS person_id,
          arraySort(groupUniqArray(${granExpr})) AS buckets,
          min(${granExpr}) AS first_bucket
        FROM events
        WHERE project_id = {project_id:UUID}
          AND event_name = {target_event:String}
          AND timestamp >= {extended_from:DateTime64(3)}
          AND timestamp <= {to:DateTime64(3)}${cohortClause}${eventFilterClause}
        GROUP BY person_id
      )
    SELECT
      toString(ts_bucket) AS period,
      status,
      uniqExact(person_id) AS count
    FROM (
      SELECT person_id, bucket AS ts_bucket,
        multiIf(
          bucket = first_bucket, 'new',
          has(buckets, bucket - ${interval}), 'returning',
          'resurrecting'
        ) AS status
      FROM person_buckets
      ARRAY JOIN buckets AS bucket
      WHERE bucket >= {from:DateTime64(3)}

      UNION ALL

      SELECT person_id, bucket + ${interval} AS ts_bucket, 'dormant' AS status
      FROM person_buckets
      ARRAY JOIN buckets AS bucket
      WHERE NOT has(buckets, bucket + ${interval})
        AND bucket + ${interval} >= {from:DateTime64(3)}
        AND bucket + ${interval} <= {to:DateTime64(3)}
    )
    GROUP BY ts_bucket, status
    ORDER BY ts_bucket ASC, status ASC`;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawLifecycleRow>();
  return assembleLifecycleResult(rows, params.granularity);
}
