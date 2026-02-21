import type { ClickHouseClient } from '@qurvo/clickhouse';
import { toChTs, RESOLVED_PERSON } from '../utils/clickhouse-helpers';

export type UEGranularity = 'day' | 'week' | 'month';

export interface UEQueryParams {
  project_id: string;
  date_from: string;
  date_to: string;
  granularity: UEGranularity;
  purchase_event_name: string;
  revenue_property: string;
  churn_window_days: number;
  filter_conditions?: Array<{property: string; value: string}>;
}

export interface UERawBucket {
  bucket: string;
  new_users: number;
  total_users: number;
  paying_users: number;
  users_with_repeat: number;
  total_purchases: number;
  total_revenue: number;
  prev_active_users: number;
  churned_users: number;
}

function granularityExpr(g: UEGranularity): string {
  switch (g) {
    case 'day':   return 'toStartOfDay(timestamp)';
    case 'week':  return 'toStartOfWeek(timestamp, 1)';
    case 'month': return 'toStartOfMonth(timestamp)';
  }
}

function granularityInterval(g: UEGranularity): string {
  switch (g) {
    case 'day':   return 'INTERVAL 1 DAY';
    case 'week':  return 'INTERVAL 7 DAY';
    case 'month': return 'INTERVAL 1 MONTH';
  }
}

function buildFilterConditions(conditions?: Array<{property: string; value: string}>): string {
  if (!conditions?.length) return '';
  return conditions
    .map((_, i) => `AND JSONExtractString(properties, {fc_prop_${i}:String}) = {fc_val_${i}:String}`)
    .join('\n          ');
}

export async function queryUnitEconomics(
  ch: ClickHouseClient,
  params: UEQueryParams,
): Promise<UERawBucket[]> {
  const gran = granularityExpr(params.granularity);
  const interval = granularityInterval(params.granularity);
  const person = RESOLVED_PERSON;

  const conditionsFilter = buildFilterConditions(params.filter_conditions);

  const query = `
    WITH
      first_seen AS (
        SELECT
          ${person} AS pid,
          min(timestamp) AS first_ts
        FROM events
        WHERE project_id = {project_id:UUID}
          AND timestamp >= {date_from:DateTime}
          AND timestamp < {date_to:DateTime} + ${interval}
          ${conditionsFilter}
        GROUP BY pid
      ),
      new_users AS (
        SELECT
          ${gran} AS bucket,
          uniqExact(pid) AS new_users
        FROM (
          SELECT pid, first_ts AS timestamp FROM first_seen
        )
        WHERE timestamp >= {date_from:DateTime}
          AND timestamp < {date_to:DateTime} + ${interval}
        GROUP BY bucket
      ),
      active_users AS (
        SELECT
          ${gran} AS bucket,
          uniqExact(${person}) AS total_users
        FROM events
        WHERE project_id = {project_id:UUID}
          AND timestamp >= {date_from:DateTime}
          AND timestamp < {date_to:DateTime} + ${interval}
          ${conditionsFilter}
        GROUP BY bucket
      ),
      purchase_data AS (
        SELECT
          ${gran} AS bucket,
          ${person} AS pid,
          count() AS purchases,
          sum(JSONExtractFloat(properties, {revenue_property:String})) AS revenue
        FROM events
        WHERE project_id = {project_id:UUID}
          AND event_name = {purchase_event:String}
          AND timestamp >= {date_from:DateTime}
          AND timestamp < {date_to:DateTime} + ${interval}
          ${conditionsFilter}
        GROUP BY bucket, pid
      ),
      purchase_agg AS (
        SELECT
          bucket,
          uniqExact(pid) AS paying_users,
          countIf(pid, purchases >= 2) AS users_with_repeat,
          sum(purchases) AS total_purchases,
          sum(revenue) AS total_revenue
        FROM purchase_data
        GROUP BY bucket
      ),
      per_bucket AS (
        SELECT ${person} AS pid, ${gran} AS ts_bucket
        FROM events
        WHERE project_id = {project_id:UUID}
          AND timestamp >= {date_from:DateTime} - ${interval}
          AND timestamp < {date_to:DateTime} + ${interval}
          ${conditionsFilter}
        GROUP BY pid, ts_bucket
      ),
      churn_data AS (
        SELECT
          ts_bucket + ${interval} AS bucket,
          uniqExact(pid) AS prev_active_users,
          uniqExactIf(pid, (pid, ts_bucket + ${interval}) NOT IN (
            SELECT pid, ts_bucket FROM per_bucket
          )) AS churned_users
        FROM per_bucket
        WHERE ts_bucket + ${interval} >= {date_from:DateTime}
          AND ts_bucket + ${interval} < {date_to:DateTime} + ${interval}
        GROUP BY bucket
      )
    SELECT
      toString(au.bucket) AS bucket,
      coalesce(nu.new_users, 0) AS new_users,
      au.total_users AS total_users,
      coalesce(pa.paying_users, 0) AS paying_users,
      coalesce(pa.users_with_repeat, 0) AS users_with_repeat,
      coalesce(pa.total_purchases, 0) AS total_purchases,
      coalesce(pa.total_revenue, 0) AS total_revenue,
      coalesce(cd.prev_active_users, 0) AS prev_active_users,
      coalesce(cd.churned_users, 0) AS churned_users
    FROM active_users au
    LEFT JOIN new_users nu ON au.bucket = nu.bucket
    LEFT JOIN purchase_agg pa ON au.bucket = pa.bucket
    LEFT JOIN churn_data cd ON au.bucket = cd.bucket
    ORDER BY au.bucket
  `;

  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    date_from: toChTs(params.date_from),
    date_to: toChTs(params.date_to, true),
    purchase_event: params.purchase_event_name,
    revenue_property: params.revenue_property,
  };
  if (params.filter_conditions) {
    params.filter_conditions.forEach((c, i) => {
      queryParams[`fc_prop_${i}`] = c.property;
      queryParams[`fc_val_${i}`] = c.value;
    });
  }

  const result = await ch.query({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  const rows = await result.json<Record<string, string>>();
  return rows.map((r) => ({
    bucket: r.bucket,
    new_users: Number(r.new_users),
    total_users: Number(r.total_users),
    paying_users: Number(r.paying_users),
    users_with_repeat: Number(r.users_with_repeat),
    total_purchases: Number(r.total_purchases),
    total_revenue: Number(r.total_revenue),
    prev_active_users: Number(r.prev_active_users),
    churned_users: Number(r.churned_users),
  }));
}
