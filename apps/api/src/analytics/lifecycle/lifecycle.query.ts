import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { toChTs, RESOLVED_PERSON, granularityTruncExpr, buildCohortClause, shiftDate, granularityInterval, buildFilterClause, tsExpr } from '../../utils/clickhouse-helpers';
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
  timezone?: string;
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
// Two-CTE approach:
//   person_buckets  — per-person sorted bucket array over [extended_from, to].
//                     extended_from = date_from - 1 period gives the 'returning'
//                     classifier one look-back period.
//   prior_active    — users with any matching event strictly before extended_from.
//                     Used to distinguish truly 'new' users from users who are
//                     'resurrecting' after a long absence (> 1 period).
//
// Classification rules per bucket:
//   new         — first_bucket in extended window AND no prior history
//   returning   — active in the immediately preceding period
//   resurrecting — was active at some earlier point but not in the preceding period
//   dormant     — was active in period N but not in period N+1 (emitted for N+1)

export async function queryLifecycle(
  ch: ClickHouseClient,
  params: LifecycleQueryParams,
): Promise<LifecycleQueryResult> {
  const hasTz = !!(params.timezone && params.timezone !== 'UTC');
  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    target_event: params.target_event,
  };
  if (hasTz) queryParams['tz'] = params.timezone;

  const extendedFrom = shiftDate(params.date_from, -1, params.granularity);
  queryParams['extended_from'] = toChTs(extendedFrom, false, params.timezone);
  queryParams['from'] = toChTs(params.date_from, false, params.timezone);
  queryParams['to'] = toChTs(params.date_to, true, params.timezone);

  const extendedFromExpr = tsExpr('extended_from', 'tz', hasTz);
  const fromExpr = tsExpr('from', 'tz', hasTz);
  const toExpr = tsExpr('to', 'tz', hasTz);
  const granExpr = granularityTruncExpr(params.granularity, 'timestamp', params.timezone);
  const interval = granularityInterval(params.granularity);

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams);

  const eventFilterParts = buildPropertyFilterConditions(params.event_filters ?? [], 'lc', queryParams);
  const eventFilterClause = buildFilterClause(eventFilterParts);

  const sql = `
    WITH
      -- Collect per-person active buckets within [extended_from, to].
      -- extended_from is 1 period before date_from, giving the returning classifier
      -- access to the previous period.  first_bucket is the earliest bucket in this
      -- window; it is used together with prior_active to decide 'new' vs 'resurrecting'.
      person_buckets AS (
        SELECT
          ${RESOLVED_PERSON} AS person_id,
          arraySort(groupUniqArray(${granExpr})) AS buckets,
          min(${granExpr}) AS first_bucket
        FROM events
        WHERE project_id = {project_id:UUID}
          AND event_name = {target_event:String}
          AND timestamp >= ${extendedFromExpr}
          AND timestamp <= ${toExpr}${cohortClause}${eventFilterClause}
        GROUP BY person_id
      ),
      -- Users who have ANY matching event strictly before extended_from.
      -- A user in this set has prior history and must never be classified as 'new'.
      -- NOTE: eventFilterClause is intentionally NOT applied here. A user who fired
      -- the target event before the range (even without matching property filters) is
      -- considered "previously active" and must be classified as 'resurrecting', not 'new'.
      prior_active AS (
        SELECT DISTINCT ${RESOLVED_PERSON} AS person_id
        FROM events
        WHERE project_id = {project_id:UUID}
          AND event_name = {target_event:String}
          AND timestamp < ${extendedFromExpr}${cohortClause}
      )
    SELECT
      toString(ts_bucket) AS period,
      status,
      uniqExact(person_id) AS count
    FROM (
      SELECT person_id, bucket AS ts_bucket,
        multiIf(
          -- 'new': first appearance in the extended window AND no prior history at all
          bucket = first_bucket AND person_id NOT IN (SELECT person_id FROM prior_active), 'new',
          has(buckets, bucket - ${interval}), 'returning',
          'resurrecting'
        ) AS status
      FROM person_buckets
      ARRAY JOIN buckets AS bucket
      WHERE bucket >= ${fromExpr}

      UNION ALL

      SELECT person_id, bucket + ${interval} AS ts_bucket, 'dormant' AS status
      FROM person_buckets
      ARRAY JOIN buckets AS bucket
      WHERE NOT has(buckets, bucket + ${interval})
        AND bucket + ${interval} >= ${fromExpr}
        AND bucket + ${interval} <= ${toExpr}
    )
    GROUP BY ts_bucket, status
    ORDER BY ts_bucket ASC, status ASC`;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawLifecycleRow>();
  return assembleLifecycleResult(rows, params.granularity);
}
