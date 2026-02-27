import type { ClickHouseClient } from '@qurvo/clickhouse';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { MAX_BREAKDOWN_VALUES } from '../../constants';
import { buildCohortFilterForBreakdown, type CohortBreakdownEntry } from '../../cohorts/cohort-breakdown.util';
import { toChTs, RESOLVED_PERSON, granularityTruncExpr, shiftPeriod, buildCohortClause, tsExpr } from '../../utils/clickhouse-helpers';
import { resolvePropertyExpr, resolveNumericPropertyExpr, buildPropertyFilterConditions, type PropertyFilter } from '../../utils/property-filter';

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
  breakdown_cohort_ids?: CohortBreakdownEntry[];
  compare?: boolean;
  cohort_filters?: CohortFilterInput[];
  timezone?: string;
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

// ── ClickHouse query parameter type ──────────────────────────────────────────

/**
 * ClickHouse query parameters used internally by trend queries.
 *
 * Static keys:
 *   project_id — UUID of the project
 *   from       — start of the date range (ClickHouse DateTime string)
 *   to         — end of the date range (ClickHouse DateTime string)
 *
 * Dynamic keys added during query building:
 *   s{i}_event            — event name for series i (String)
 *   s{i}_f{j}_v           — filter value for series i, filter j
 *   cohort_bd_{i}_{j}      — cohort ID for cohort breakdown (UUID)
 *   cohort_name_{i}_{j}    — cohort label for cohort breakdown (String)
 *   cohort_filter_*        — params injected by buildCohortClause / buildCohortFilterForBreakdown
 */
interface TrendChQueryParams {
  project_id: string;
  from: string;
  to: string;
  [key: string]: unknown;
}

// ── Filter condition builder ──────────────────────────────────────────────────

function buildSeriesConditions(
  series: TrendSeries,
  idx: number,
  queryParams: TrendChQueryParams,
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
    const bv = (row.breakdown_value != null && row.breakdown_value !== '') ? row.breakdown_value : '(none)';
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
  const hasTz = !!(params.timezone && params.timezone !== 'UTC');
  const queryParams: TrendChQueryParams = {
    project_id: params.project_id,
    from: toChTs(dateFrom, false, params.timezone),
    to: toChTs(dateTo, true, params.timezone),
  };
  if (hasTz) queryParams['tz'] = params.timezone;

  const fromExpr = tsExpr('from', 'tz', hasTz);
  const toExpr = tsExpr('to', 'tz', hasTz);
  const bucketExpr = granularityTruncExpr(params.granularity, 'timestamp', params.timezone);
  const hasCohortBreakdown = !!params.breakdown_cohort_ids?.length;
  const hasBreakdown = !!params.breakdown_property && !hasCohortBreakdown;
  const aggCol = buildAggColumn(params.metric, params.metric_property);

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams, toChTs(dateTo, true), toChTs(dateFrom));

  // Cohort breakdown path: one arm per (series x cohort)
  if (hasCohortBreakdown) {
    const cohortBreakdowns = params.breakdown_cohort_ids!;
    const arms: string[] = [];
    params.series.forEach((s, seriesIdx) => {
      const cond = buildSeriesConditions(s, seriesIdx, queryParams);
      cohortBreakdowns.forEach((cb, cbIdx) => {
        const paramKey = `cohort_bd_${seriesIdx}_${cbIdx}`;
        const cohortFilter = buildCohortFilterForBreakdown(cb, paramKey, 900 + cbIdx, queryParams, toChTs(dateTo, true));
        const nameKey = `cohort_name_${seriesIdx}_${cbIdx}`;
        queryParams[nameKey] = cb.name;
        arms.push(`
          SELECT
            ${seriesIdx} AS series_idx,
            {${nameKey}:String} AS breakdown_value,
            ${bucketExpr} AS bucket,
            count() AS raw_value,
            uniqExact(${RESOLVED_PERSON}) AS uniq_value,
            ${aggCol}
          FROM events
          WHERE
            project_id = {project_id:UUID}
            AND timestamp >= ${fromExpr}
            AND timestamp <= ${toExpr}
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
        FROM events
        WHERE
          project_id = {project_id:UUID}
          AND timestamp >= ${fromExpr}
          AND timestamp <= ${toExpr}
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
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        AND ${cond}${cohortClause}
      GROUP BY breakdown_value, bucket`;
  });

  // top_values CTE: use UNION ALL of per-series conditions so that only events
  // matching at least one series' full filter set are considered. This prevents
  // breakdown values from unrelated events (that match no series filter) from
  // occupying slots in the top-N list.
  const topValuesArms = params.series.map((s, idx) => {
    // buildSeriesConditions already populated queryParams for this series index,
    // so we just need to reconstruct the condition string without re-mutating params.
    const filterParts = buildPropertyFilterConditions(
      s.filters ?? [],
      `s${idx}`,
      queryParams,
    );
    const cond = [`event_name = {s${idx}_event:String}`, ...filterParts].join(' AND ');
    return `
      SELECT ${breakdownExpr} AS breakdown_value
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}
        AND ${cond}${cohortClause}`;
  });

  const sql = `
    WITH top_values AS (
      SELECT breakdown_value, count() AS cnt
      FROM (
        ${topValuesArms.join('\nUNION ALL\n')}
      )
      GROUP BY breakdown_value
      ORDER BY cnt DESC
      LIMIT ${MAX_BREAKDOWN_VALUES}
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
