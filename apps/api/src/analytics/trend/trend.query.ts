import type { ClickHouseClient } from '@qurvo/clickhouse';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { CohortFilterInput } from '../../cohorts/cohorts.query';
import type { CohortConditionGroup } from '@qurvo/db';
import { buildCohortFilterForBreakdown } from '../../utils/cohort-breakdown.util';
import { toChTs, RESOLVED_PERSON, granularityTruncExpr, shiftPeriod, buildCohortClause } from '../../utils/clickhouse-helpers';
import { resolvePropertyExpr, buildPropertyFilterConditions, type PropertyFilter } from '../../utils/property-filter';

// ── Public types ──────────────────────────────────────────────────────────────

export type TrendMetric = 'total_events' | 'unique_users' | 'events_per_user'
  | 'property_sum' | 'property_avg' | 'property_min' | 'property_max';
export type TrendGranularity = 'hour' | 'day' | 'week' | 'month';

export interface TrendSeries {
  event_name: string;
  label: string;
  filters?: PropertyFilter[];
}

export interface TrendQueryParams {
  project_id: string;
  series: TrendSeries[];
  metric: TrendMetric;
  metric_property?: string;
  granularity: TrendGranularity;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  breakdown_cohort_ids?: { cohort_id: string; name: string; is_static: boolean; materialized: boolean; definition: CohortConditionGroup }[];
  compare?: boolean;
  cohort_filters?: CohortFilterInput[];
}

export interface TrendDataPoint {
  bucket: string;
  value: number;
}

export interface TrendSeriesResult {
  series_idx: number;
  label: string;
  event_name: string;
  data: TrendDataPoint[];
  breakdown_value?: string;
}

export type TrendQueryResult =
  | { compare: false; breakdown: false; series: TrendSeriesResult[] }
  | { compare: false; breakdown: true; breakdown_property: string; series: TrendSeriesResult[] }
  | { compare: true; breakdown: false; series: TrendSeriesResult[]; series_previous: TrendSeriesResult[] }
  | { compare: true; breakdown: true; breakdown_property: string; series: TrendSeriesResult[]; series_previous: TrendSeriesResult[] };

// ── Filter condition builder ──────────────────────────────────────────────────

function buildSeriesConditions(
  series: TrendSeries,
  idx: number,
  queryParams: Record<string, unknown>,
): string {
  queryParams[`s${idx}_event`] = series.event_name;
  const filterParts = buildPropertyFilterConditions(
    series.filters ?? [],
    `s${idx}`,
    queryParams,
  );
  return [`event_name = {s${idx}_event:String}`, ...filterParts].join(' AND ');
}

// ── Raw row types from ClickHouse ─────────────────────────────────────────────

interface RawTrendRow {
  series_idx: string;
  bucket: string;
  raw_value: string;
  uniq_value: string;
  agg_value: string;
}

interface RawBreakdownRow extends RawTrendRow {
  breakdown_value: string;
}

function resolveNumericPropertyExpr(prop: string): string {
  if (prop.startsWith('properties.')) {
    const key = prop.slice('properties.'.length).replace(/'/g, "\\'");
    return `toFloat64OrZero(JSONExtractRaw(properties, '${key}'))`;
  }
  if (prop.startsWith('user_properties.')) {
    const key = prop.slice('user_properties.'.length).replace(/'/g, "\\'");
    return `toFloat64OrZero(JSONExtractRaw(user_properties, '${key}'))`;
  }
  throw new AppBadRequestException(`Unknown metric property: ${prop}`);
}

const AGG_FUNCTIONS: Record<string, string> = {
  property_sum: 'sum',
  property_avg: 'avg',
  property_min: 'min',
  property_max: 'max',
};

function buildAggColumn(metric: TrendMetric, metricProperty?: string): string {
  const fn = AGG_FUNCTIONS[metric];
  if (!fn) return '0 AS agg_value';
  if (!metricProperty) throw new AppBadRequestException('metric_property is required for property aggregation metrics');
  const expr = resolveNumericPropertyExpr(metricProperty);
  return `${fn}(${expr}) AS agg_value`;
}

// ── Result assembly ───────────────────────────────────────────────────────────

function assembleValue(metric: TrendMetric, raw: string, uniq: string, agg: string): number {
  if (metric.startsWith('property_')) return Number(agg);
  if (metric === 'total_events') return Number(raw);
  if (metric === 'unique_users') return Number(uniq);
  // events_per_user
  const u = Number(uniq);
  return u > 0 ? Math.round((Number(raw) / u) * 100) / 100 : 0;
}

function assembleNonBreakdown(
  rows: RawTrendRow[],
  metric: TrendMetric,
  seriesMeta: TrendSeries[],
): TrendSeriesResult[] {
  const grouped = new Map<number, TrendDataPoint[]>();
  for (const row of rows) {
    const idx = Number(row.series_idx);
    if (!grouped.has(idx)) grouped.set(idx, []);
    grouped.get(idx)!.push({
      bucket: row.bucket,
      value: assembleValue(metric, row.raw_value, row.uniq_value, row.agg_value),
    });
  }
  return seriesMeta.map((s, idx) => ({
    series_idx: idx,
    label: s.label,
    event_name: s.event_name,
    data: grouped.get(idx) ?? [],
  }));
}

function assembleBreakdown(
  rows: RawBreakdownRow[],
  metric: TrendMetric,
  seriesMeta: TrendSeries[],
): TrendSeriesResult[] {
  const grouped = new Map<string, TrendDataPoint[]>();
  const keyMeta = new Map<string, { series_idx: number; breakdown_value: string }>();
  for (const row of rows) {
    const idx = Number(row.series_idx);
    const bv = row.breakdown_value || '(none)';
    const key = `${idx}::${bv}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
      keyMeta.set(key, { series_idx: idx, breakdown_value: bv });
    }
    grouped.get(key)!.push({
      bucket: row.bucket,
      value: assembleValue(metric, row.raw_value, row.uniq_value, row.agg_value),
    });
  }
  const results: TrendSeriesResult[] = [];
  for (const [key, data] of grouped) {
    const meta = keyMeta.get(key)!;
    const s = seriesMeta[meta.series_idx];
    results.push({
      series_idx: meta.series_idx,
      label: s?.label ?? '',
      event_name: s?.event_name ?? '',
      data,
      breakdown_value: meta.breakdown_value,
    });
  }
  return results;
}

// ── Core query executor ───────────────────────────────────────────────────────

async function executeTrendQuery(
  ch: ClickHouseClient,
  params: TrendQueryParams,
  dateFrom: string,
  dateTo: string,
): Promise<TrendSeriesResult[]> {
  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    from: toChTs(dateFrom),
    to: toChTs(dateTo, true),
  };

  const bucketExpr = granularityTruncExpr(params.granularity, 'timestamp');
  const hasCohortBreakdown = !!params.breakdown_cohort_ids?.length;
  const hasBreakdown = !!params.breakdown_property && !hasCohortBreakdown;
  const aggCol = buildAggColumn(params.metric, params.metric_property);

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams);

  // Cohort breakdown path: one arm per (series x cohort)
  if (hasCohortBreakdown) {
    const cohortBreakdowns = params.breakdown_cohort_ids!;
    const arms: string[] = [];
    params.series.forEach((s, seriesIdx) => {
      const cond = buildSeriesConditions(s, seriesIdx, queryParams);
      cohortBreakdowns.forEach((cb, cbIdx) => {
        const paramKey = `cohort_bd_${seriesIdx}_${cbIdx}`;
        const cohortFilter = buildCohortFilterForBreakdown(cb, paramKey, 900 + cbIdx, queryParams);
        arms.push(`
          SELECT
            ${seriesIdx} AS series_idx,
            '${cb.name.replace(/'/g, "\\'")}' AS breakdown_value,
            ${bucketExpr} AS bucket,
            count() AS raw_value,
            uniqExact(${RESOLVED_PERSON}) AS uniq_value,
            ${aggCol}
          FROM events FINAL
          WHERE
            project_id = {project_id:UUID}
            AND timestamp >= {from:DateTime64(3)}
            AND timestamp <= {to:DateTime64(3)}
            AND ${cond}${cohortClause}
            AND ${cohortFilter}
          GROUP BY bucket`);
      });
    });

    const sql = `${arms.join('\nUNION ALL\n')}\nORDER BY series_idx ASC, breakdown_value ASC, bucket ASC`;
    const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await result.json<RawBreakdownRow>();
    return assembleBreakdown(rows, params.metric, params.series);
  }

  if (!hasBreakdown) {
    const arms = params.series.map((s, idx) => {
      const cond = buildSeriesConditions(s, idx, queryParams);
      return `
        SELECT
          ${idx} AS series_idx,
          ${bucketExpr} AS bucket,
          count() AS raw_value,
          uniqExact(${RESOLVED_PERSON}) AS uniq_value,
          ${aggCol}
        FROM events FINAL
        WHERE
          project_id = {project_id:UUID}
          AND timestamp >= {from:DateTime64(3)}
          AND timestamp <= {to:DateTime64(3)}
          AND ${cond}${cohortClause}
        GROUP BY bucket`;
    });

    const sql = `${arms.join('\nUNION ALL\n')}\nORDER BY series_idx ASC, bucket ASC`;

    const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await result.json<RawTrendRow>();
    return assembleNonBreakdown(rows, params.metric, params.series);
  }

  // Breakdown path
  const breakdownExpr = resolvePropertyExpr(params.breakdown_property!);
  const allEventNames = params.series.map((s) => s.event_name);
  queryParams['all_event_names'] = allEventNames;

  const arms = params.series.map((s, idx) => {
    const cond = buildSeriesConditions(s, idx, queryParams);
    return `
      SELECT
        ${idx} AS series_idx,
        ${breakdownExpr} AS breakdown_value,
        ${bucketExpr} AS bucket,
        count() AS raw_value,
        uniqExact(${RESOLVED_PERSON}) AS uniq_value,
        ${aggCol}
      FROM events FINAL
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND ${cond}${cohortClause}
      GROUP BY breakdown_value, bucket`;
  });

  const sql = `
    WITH top_values AS (
      SELECT ${breakdownExpr} AS breakdown_value
      FROM events FINAL
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name IN ({all_event_names:Array(String)})
      GROUP BY breakdown_value
      ORDER BY count() DESC
      LIMIT 25
    )
    SELECT series_idx, breakdown_value, bucket, raw_value, uniq_value, agg_value
    FROM (
      ${arms.join('\nUNION ALL\n')}
    )
    WHERE breakdown_value IN (SELECT breakdown_value FROM top_values)
    ORDER BY series_idx ASC, breakdown_value ASC, bucket ASC`;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawBreakdownRow>();
  return assembleBreakdown(rows, params.metric, params.series);
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function queryTrend(
  ch: ClickHouseClient,
  params: TrendQueryParams,
): Promise<TrendQueryResult> {
  const currentSeries = await executeTrendQuery(ch, params, params.date_from, params.date_to);

  const hasAnyBreakdown = !!params.breakdown_property || !!params.breakdown_cohort_ids?.length;
  const breakdownLabel = params.breakdown_cohort_ids?.length ? '$cohort' : params.breakdown_property;

  if (!params.compare) {
    if (!hasAnyBreakdown) {
      return { compare: false, breakdown: false, series: currentSeries };
    }
    return {
      compare: false,
      breakdown: true,
      breakdown_property: breakdownLabel!,
      series: currentSeries,
    };
  }

  const prev = shiftPeriod(params.date_from, params.date_to);
  const previousSeries = await executeTrendQuery(ch, params, prev.from, prev.to);

  if (!hasAnyBreakdown) {
    return { compare: true, breakdown: false, series: currentSeries, series_previous: previousSeries };
  }
  return {
    compare: true,
    breakdown: true,
    breakdown_property: breakdownLabel!,
    series: currentSeries,
    series_previous: previousSeries,
  };
}
