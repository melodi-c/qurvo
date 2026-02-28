import type { ClickHouseClient } from '@qurvo/clickhouse';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { MAX_BREAKDOWN_VALUES } from '../../constants';
import { buildCohortFilterForBreakdown, type CohortBreakdownEntry } from '../../cohorts/cohort-breakdown.util';
import {
  compile,
  select,
  unionAll,
  alias,
  col,
  literal,
  param,
  rawWithParams,
  count,
  inArray,
  inSubquery,
} from '@qurvo/ch-query';
import {
  analyticsWhere,
  resolvePropertyExpr,
  bucket,
  toChTs,
  shiftPeriod,
  aggColumn,
  baseMetricColumns,
  type PropertyFilter,
  type TrendMetric,
} from '../query-helpers';

// ── Public types ──────────────────────────────────────────────────────────────

export type { TrendMetric };
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
  /** Human-readable label for the breakdown group. Set when breakdown_type='cohort'. */
  breakdown_label?: string;
}

export type TrendQueryResult =
  | { compare: false; breakdown: false; series: TrendSeriesResult[] }
  | { compare: false; breakdown: true; breakdown_property: string; series: TrendSeriesResult[] }
  | { compare: true; breakdown: false; series: TrendSeriesResult[]; series_previous: TrendSeriesResult[] }
  | { compare: true; breakdown: true; breakdown_property: string; series: TrendSeriesResult[]; series_previous: TrendSeriesResult[] };

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

// ── Result assembly ───────────────────────────────────────────────────────────

function assembleValue(metric: TrendMetric, rawVal: string, uniq: string, agg: string): number {
  if (metric.startsWith('property_')) {return Number(agg);}
  if (metric === 'total_events') {return Number(rawVal);}
  if (metric === 'unique_users') {return Number(uniq);}
  // events_per_user
  const u = Number(uniq);
  return u > 0 ? Math.round((Number(rawVal) / u) * 100) / 100 : 0;
}

function assembleNonBreakdown(
  rows: RawTrendRow[],
  metric: TrendMetric,
  seriesMeta: TrendSeries[],
): TrendSeriesResult[] {
  const grouped = new Map<number, TrendDataPoint[]>();
  for (const row of rows) {
    const idx = Number(row.series_idx);
    const existing = grouped.get(idx);
    if (existing) {
      existing.push({ bucket: row.bucket, value: assembleValue(metric, row.raw_value, row.uniq_value, row.agg_value) });
    } else {
      grouped.set(idx, [{ bucket: row.bucket, value: assembleValue(metric, row.raw_value, row.uniq_value, row.agg_value) }]);
    }
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
  cohortLabelMap?: Map<string, string>,
): TrendSeriesResult[] {
  const grouped = new Map<string, TrendDataPoint[]>();
  const keyMeta = new Map<string, { series_idx: number; breakdown_value: string }>();
  for (const row of rows) {
    const idx = Number(row.series_idx);
    const bv = (row.breakdown_value !== null && row.breakdown_value !== undefined && row.breakdown_value !== '') ? row.breakdown_value : '(none)';
    const key = `${idx}::${bv}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.push({
        bucket: row.bucket,
        value: assembleValue(metric, row.raw_value, row.uniq_value, row.agg_value),
      });
    } else {
      grouped.set(key, [{
        bucket: row.bucket,
        value: assembleValue(metric, row.raw_value, row.uniq_value, row.agg_value),
      }]);
      keyMeta.set(key, { series_idx: idx, breakdown_value: bv });
    }
  }
  const results: TrendSeriesResult[] = [];
  for (const [key, data] of grouped) {
    const meta = keyMeta.get(key);
    if (!meta) { continue; }
    const s = seriesMeta[meta.series_idx];
    const breakdownLabel = cohortLabelMap?.get(meta.breakdown_value);
    results.push({
      series_idx: meta.series_idx,
      label: s?.label ?? '',
      event_name: s?.event_name ?? '',
      data,
      breakdown_value: meta.breakdown_value,
      ...(breakdownLabel !== undefined ? { breakdown_label: breakdownLabel } : {}),
    });
  }
  return results;
}

// ── Series WHERE builder ──────────────────────────────────────────────────────

/**
 * Builds the WHERE clause for a single series arm, combining:
 *  - project_id, time range, timezone
 *  - event_name filter
 *  - per-series property filters
 *  - global cohort filters
 *
 * All parameters are automatically numbered by the compiler.
 */
function seriesWhere(
  s: TrendSeries,
  params: TrendQueryParams,
  dateFrom: string,
  dateTo: string,
) {
  return analyticsWhere({
    projectId: params.project_id,
    from: dateFrom,
    to: dateTo,
    tz: params.timezone,
    eventName: s.event_name,
    filters: s.filters,
    cohortFilters: params.cohort_filters,
    dateTo: toChTs(dateTo, true),
    dateFrom: toChTs(dateFrom),
  });
}

// ── Agg column with validation ────────────────────────────────────────────────

function buildAggColumnExpr(metric: TrendMetric, metricProperty?: string) {
  if (metric.startsWith('property_') && !metricProperty) {
    throw new AppBadRequestException('metric_property is required for property aggregation metrics');
  }
  return alias(aggColumn(metric, metricProperty), 'agg_value');
}

// ── Core query executor ───────────────────────────────────────────────────────

/**
 * Execute the trend query using the ch-query AST builder.
 *
 * Three branches:
 *  1. Cohort breakdown — one arm per (series x cohort)
 *  2. Non-breakdown — one arm per series
 *  3. Property breakdown — one arm per series + top_values CTE or fixed values
 *
 * @param fixedBreakdownValues — when provided (compare mode), skip the top_values CTE and
 *   filter by this pre-computed set of breakdown values instead.
 */
async function executeTrendQuery(
  ch: ClickHouseClient,
  params: TrendQueryParams,
  dateFrom: string,
  dateTo: string,
  fixedBreakdownValues?: string[],
): Promise<TrendSeriesResult[]> {
  const hasCohortBreakdown = !!params.breakdown_cohort_ids?.length;
  const hasBreakdown = !!params.breakdown_property && !hasCohortBreakdown;
  const bucketExpr = bucket(params.granularity, 'timestamp', params.timezone);
  const aggCol = buildAggColumnExpr(params.metric, params.metric_property);

  // ── Branch 1: Cohort breakdown ──
  if (hasCohortBreakdown) {
    const cohortBreakdowns = params.breakdown_cohort_ids ?? [];
    const cohortLabelMap = new Map<string, string>(cohortBreakdowns.map((cb) => [cb.cohort_id, cb.name]));

    // Cohort breakdown uses rawWithParams for the cohort filter predicates
    // because buildCohortFilterForBreakdown returns raw SQL with named params.
    // project_id must be in queryParams because the cohort SQL references {project_id:UUID}.
    const queryParams: Record<string, unknown> = { project_id: params.project_id };
    const arms = params.series.flatMap((s, seriesIdx) => {
      // Build series-level event + filter conditions via the old path
      // because we need to mix raw cohort SQL into the WHERE.
      return cohortBreakdowns.map((cb, cbIdx) => {
        const paramKey = `cohort_bd_${seriesIdx}_${cbIdx}`;
        const cohortFilterSql = buildCohortFilterForBreakdown(
          cb, paramKey, 900 + cbIdx, queryParams,
          toChTs(dateTo, true), toChTs(dateFrom),
        );
        const cohortIdKey = `cohort_id_${seriesIdx}_${cbIdx}`;
        queryParams[cohortIdKey] = cb.cohort_id;

        return select(
          literal(seriesIdx).as('series_idx'),
          rawWithParams(`{${cohortIdKey}:String}`, { [cohortIdKey]: cb.cohort_id }).as('breakdown_value'),
          alias(bucketExpr, 'bucket'),
          ...baseMetricColumns(),
          aggCol,
        )
          .from('events')
          .where(
            seriesWhere(s, params, dateFrom, dateTo),
            rawWithParams(cohortFilterSql, queryParams),
          )
          .groupBy(col('bucket'))
          .build();
      });
    });

    const query = select(
      col('series_idx'), col('breakdown_value'), col('bucket'),
      col('raw_value'), col('uniq_value'), col('agg_value'),
    )
      .from(unionAll(...arms))
      .orderBy(col('series_idx'))
      .orderBy(col('breakdown_value'))
      .orderBy(col('bucket'))
      .build();

    const compiled = compile(query);
    const result = await ch.query({ query: compiled.sql, query_params: compiled.params, format: 'JSONEachRow' });
    const rows = await result.json<RawBreakdownRow>();
    return assembleBreakdown(rows, params.metric, params.series, cohortLabelMap);
  }

  // ── Branch 2: Non-breakdown ──
  if (!hasBreakdown) {
    const arms = params.series.map((s, idx) =>
      select(
        literal(idx).as('series_idx'),
        alias(bucketExpr, 'bucket'),
        ...baseMetricColumns(),
        aggCol,
      )
        .from('events')
        .where(seriesWhere(s, params, dateFrom, dateTo))
        .groupBy(col('bucket'))
        .build(),
    );

    const query = select(
      col('series_idx'), col('bucket'),
      col('raw_value'), col('uniq_value'), col('agg_value'),
    )
      .from(unionAll(...arms))
      .orderBy(col('series_idx'))
      .orderBy(col('bucket'))
      .build();

    const compiled = compile(query);
    const result = await ch.query({ query: compiled.sql, query_params: compiled.params, format: 'JSONEachRow' });
    const rows = await result.json<RawTrendRow>();
    return assembleNonBreakdown(rows, params.metric, params.series);
  }

  // ── Branch 3: Property breakdown ──
  const breakdownExpr = resolvePropertyExpr(params.breakdown_property ?? '');

  const arms = params.series.map((s, idx) =>
    select(
      literal(idx).as('series_idx'),
      alias(breakdownExpr, 'breakdown_value'),
      alias(bucketExpr, 'bucket'),
      ...baseMetricColumns(),
      aggCol,
    )
      .from('events')
      .where(seriesWhere(s, params, dateFrom, dateTo))
      .groupBy(col('breakdown_value'), col('bucket'))
      .build(),
  );

  let query;

  if (fixedBreakdownValues) {
    // Compare mode: filter by the fixed set of breakdown values from the current period.
    query = select(
      col('series_idx'), col('breakdown_value'), col('bucket'),
      col('raw_value'), col('uniq_value'), col('agg_value'),
    )
      .from(unionAll(...arms))
      .where(inArray(col('breakdown_value'), param('Array(String)', fixedBreakdownValues)))
      .orderBy(col('series_idx'))
      .orderBy(col('breakdown_value'))
      .orderBy(col('bucket'))
      .build();
  } else {
    // Top-N CTE: select breakdown values by frequency across all series.
    const topValuesArms = params.series.map((s) =>
      select(alias(breakdownExpr, 'breakdown_value'))
        .from('events')
        .where(seriesWhere(s, params, dateFrom, dateTo))
        .build(),
    );

    const topValuesCte = select(col('breakdown_value'), count().as('cnt'))
      .from(unionAll(...topValuesArms))
      .groupBy(col('breakdown_value'))
      .orderBy(col('cnt'), 'DESC')
      .limit(MAX_BREAKDOWN_VALUES)
      .build();

    const topValuesRef = select(col('breakdown_value')).from('top_values').build();

    query = select(
      col('series_idx'), col('breakdown_value'), col('bucket'),
      col('raw_value'), col('uniq_value'), col('agg_value'),
    )
      .from(unionAll(...arms))
      .where(inSubquery(col('breakdown_value'), topValuesRef))
      .with('top_values', topValuesCte)
      .orderBy(col('series_idx'))
      .orderBy(col('breakdown_value'))
      .orderBy(col('bucket'))
      .build();
  }

  const compiled = compile(query);
  const result = await ch.query({ query: compiled.sql, query_params: compiled.params, format: 'JSONEachRow' });
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
      breakdown_property: breakdownLabel ?? '',
      series: currentSeries,
    };
  }

  const prev = shiftPeriod(params.date_from, params.date_to);

  // When comparing with a property breakdown, lock the previous-period query to the
  // same set of breakdown values that appeared in the current period.
  const hasPropertyBreakdown = !!params.breakdown_property && !params.breakdown_cohort_ids?.length;
  let fixedBreakdownValues: string[] | undefined;
  if (hasPropertyBreakdown) {
    fixedBreakdownValues = [
      ...new Set(
        currentSeries.map((s) => {
          const bv = s.breakdown_value ?? '(none)';
          return bv === '(none)' ? '' : bv;
        }),
      ),
    ];
  }

  let previousSeries = await executeTrendQuery(ch, params, prev.from, prev.to, fixedBreakdownValues);

  // Fill gaps for breakdown values absent in the previous period.
  if (hasPropertyBreakdown) {
    const prevIndex = new Set(previousSeries.map((s) => `${s.series_idx}::${s.breakdown_value ?? '(none)'}`));
    const gaps: TrendSeriesResult[] = [];
    for (const cur of currentSeries) {
      const key = `${cur.series_idx}::${cur.breakdown_value ?? '(none)'}`;
      if (!prevIndex.has(key)) {
        gaps.push({
          series_idx: cur.series_idx,
          label: cur.label,
          event_name: cur.event_name,
          data: [],
          breakdown_value: cur.breakdown_value,
          ...(cur.breakdown_label !== undefined ? { breakdown_label: cur.breakdown_label } : {}),
        });
      }
    }
    if (gaps.length > 0) {
      previousSeries = [...previousSeries, ...gaps];
    }
  }

  if (!hasAnyBreakdown) {
    return { compare: true, breakdown: false, series: currentSeries, series_previous: previousSeries };
  }
  return {
    compare: true,
    breakdown: true,
    breakdown_property: breakdownLabel ?? '',
    series: currentSeries,
    series_previous: previousSeries,
  };
}
