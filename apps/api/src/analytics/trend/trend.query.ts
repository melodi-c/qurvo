import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import { MAX_BREAKDOWN_VALUES } from '../../constants';
import { buildCohortFilterForBreakdown, type CohortBreakdownEntry } from '../../cohorts/cohort-breakdown.util';
import {
  select,
  unionAll,
  alias,
  col,
  literal,
  param,
  namedParam,
  count,
  inArray,
  inSubquery,
  type Expr,
} from '@qurvo/ch-query';
import {
  analyticsWhere,
  resolvePropertyExpr,
  bucket,
  cohortBounds,
  shiftPeriod,
  aggColumn,
  baseMetricColumns,
  normalizeBreakdownValue,
  type PropertyFilter,
  type TrendMetric,
} from '../query-helpers';

// Public types

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
  timezone: string;
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

// Raw row types from ClickHouse

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

// Result assembly

/** Extract the numeric value from a raw ClickHouse row based on the metric type. */
function rowToValue(metric: TrendMetric, row: RawTrendRow): number {
  if (metric.startsWith('property_')) { return Number(row.agg_value); }
  if (metric === 'total_events') { return Number(row.raw_value); }
  if (metric === 'unique_users') { return Number(row.uniq_value); }
  const u = Number(row.uniq_value);
  return u > 0 ? Math.round((Number(row.raw_value) / u) * 100) / 100 : 0;
}

/**
 * Assemble raw ClickHouse rows into TrendSeriesResult[].
 * Handles both breakdown and non-breakdown rows: detects breakdown by checking
 * for `breakdown_value` in the first row (or the `isBreakdown` hint for empty results).
 */
function assembleRows(
  rows: RawTrendRow[],
  metric: TrendMetric,
  seriesMeta: TrendSeries[],
  opts?: { cohortLabelMap?: Map<string, string>; isBreakdown?: boolean },
): TrendSeriesResult[] {
  const isBreakdown = rows.length > 0
    ? 'breakdown_value' in rows[0]
    : !!opts?.isBreakdown;

  if (rows.length === 0) {
    // Breakdown with no rows → nothing to group.
    // Non-breakdown with no rows → one empty result per series.
    if (isBreakdown) { return []; }
    return seriesMeta.map((s, idx) => ({
      series_idx: idx,
      label: s.label,
      event_name: s.event_name,
      data: [],
    }));
  }

  if (!isBreakdown) {
    // Non-breakdown path
    const grouped = new Map<number, TrendDataPoint[]>();
    for (const row of rows) {
      const idx = Number(row.series_idx);
      const point: TrendDataPoint = { bucket: row.bucket, value: rowToValue(metric, row) };
      const existing = grouped.get(idx);
      if (existing) {
        existing.push(point);
      } else {
        grouped.set(idx, [point]);
      }
    }
    return seriesMeta.map((s, idx) => ({
      series_idx: idx,
      label: s.label,
      event_name: s.event_name,
      data: grouped.get(idx) ?? [],
    }));
  }

  // Breakdown path
  const grouped = new Map<string, { idx: number; bv: string; data: TrendDataPoint[] }>();
  for (const row of rows as RawBreakdownRow[]) {
    const idx = Number(row.series_idx);
    const bv = normalizeBreakdownValue(row.breakdown_value);
    const key = `${idx}::${bv}`;
    const entry = grouped.get(key);
    const point: TrendDataPoint = { bucket: row.bucket, value: rowToValue(metric, row) };
    if (entry) {
      entry.data.push(point);
    } else {
      grouped.set(key, { idx, bv, data: [point] });
    }
  }

  const results: TrendSeriesResult[] = [];
  for (const { idx, bv, data } of grouped.values()) {
    const s = seriesMeta[idx];
    const breakdownLabel = opts?.cohortLabelMap?.get(bv);
    results.push({
      series_idx: idx,
      label: s?.label ?? '',
      event_name: s?.event_name ?? '',
      data,
      breakdown_value: bv,
      ...(breakdownLabel !== undefined ? { breakdown_label: breakdownLabel } : {}),
    });
  }
  return results;
}

// Series WHERE builder

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
    ...cohortBounds(params),
  });
}

// Agg column with validation

function buildAggColumnExpr(metric: TrendMetric, metricProperty?: string) {
  if (metric.startsWith('property_') && !metricProperty) {
    throw new AppBadRequestException('metric_property is required for property aggregation metrics');
  }
  return alias(aggColumn(metric, metricProperty), 'agg_value');
}

// Series arm builder

/**
 * Build a single SELECT arm for one series. Shared by branches 2 (non-breakdown)
 * and 3 (property breakdown). When `breakdownExpr` is provided, adds
 * `breakdown_value` column and groups by it.
 */
function buildSeriesArm(
  idx: number,
  s: TrendSeries,
  params: TrendQueryParams,
  dateFrom: string,
  dateTo: string,
  bucketExpr: Expr,
  aggCol: Expr,
  breakdownExpr?: Expr,
) {
  const columns: Expr[] = [
    literal(idx).as('series_idx'),
    ...(breakdownExpr ? [alias(breakdownExpr, 'breakdown_value')] : []),
    alias(bucketExpr, 'bucket'),
    ...baseMetricColumns(),
    aggCol,
  ];
  const groupByExprs: Expr[] = [col('bucket')];
  if (breakdownExpr) {
    groupByExprs.unshift(col('breakdown_value'));
  }
  return select(...columns)
    .from('events')
    .where(seriesWhere(s, params, dateFrom, dateTo))
    .groupBy(...groupByExprs)
    .build();
}

// Core query executor

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
  chx: ChQueryExecutor,
  params: TrendQueryParams,
  dateFrom: string,
  dateTo: string,
  fixedBreakdownValues?: string[],
): Promise<TrendSeriesResult[]> {
  const hasCohortBreakdown = !!params.breakdown_cohort_ids?.length;
  const hasBreakdown = !!params.breakdown_property && !hasCohortBreakdown;
  const bucketExpr = bucket(params.granularity, 'timestamp', params.timezone);
  const aggCol = buildAggColumnExpr(params.metric, params.metric_property);

  // Branch 1: Cohort breakdown
  if (hasCohortBreakdown) {
    const cohortBreakdowns = params.breakdown_cohort_ids ?? [];
    const cohortLabelMap = new Map<string, string>(cohortBreakdowns.map((cb) => [cb.cohort_id, cb.name]));

    const { dateTo: cbDateTo, dateFrom: cbDateFrom } = cohortBounds(params);
    const arms = params.series.flatMap((s, seriesIdx) => {
      return cohortBreakdowns.map((cb, cbIdx) => {
        const paramKey = `cohort_bd_${seriesIdx}_${cbIdx}`;
        const cohortFilterExpr = buildCohortFilterForBreakdown(
          cb, paramKey, 900 + cbIdx, params.project_id,
          cbDateTo, cbDateFrom,
        );
        const cohortIdKey = `cohort_id_${seriesIdx}_${cbIdx}`;

        return select(
          literal(seriesIdx).as('series_idx'),
          namedParam(cohortIdKey, 'String', cb.cohort_id).as('breakdown_value'),
          alias(bucketExpr, 'bucket'),
          ...baseMetricColumns(),
          aggCol,
        )
          .from('events')
          .where(
            seriesWhere(s, params, dateFrom, dateTo),
            cohortFilterExpr,
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

    const rows = await chx.rows<RawBreakdownRow>(query);
    return assembleRows(rows, params.metric, params.series, { cohortLabelMap, isBreakdown: true });
  }

  // Branch 2: Non-breakdown
  if (!hasBreakdown) {
    const arms = params.series.map((s, idx) =>
      buildSeriesArm(idx, s, params, dateFrom, dateTo, bucketExpr, aggCol),
    );

    const query = select(
      col('series_idx'), col('bucket'),
      col('raw_value'), col('uniq_value'), col('agg_value'),
    )
      .from(unionAll(...arms))
      .orderBy(col('series_idx'))
      .orderBy(col('bucket'))
      .build();

    const rows = await chx.rows<RawTrendRow>(query);
    return assembleRows(rows, params.metric, params.series);
  }

  // Branch 3: Property breakdown
  const breakdownExpr = resolvePropertyExpr(params.breakdown_property ?? '');

  const arms = params.series.map((s, idx) =>
    buildSeriesArm(idx, s, params, dateFrom, dateTo, bucketExpr, aggCol, breakdownExpr),
  );

  // Build the outer query once, then clone for the two sub-paths.
  const baseOuter = select(
    col('series_idx'), col('breakdown_value'), col('bucket'),
    col('raw_value'), col('uniq_value'), col('agg_value'),
  )
    .from(unionAll(...arms))
    .orderBy(col('series_idx'))
    .orderBy(col('breakdown_value'))
    .orderBy(col('bucket'));

  let query;

  if (fixedBreakdownValues) {
    // Compare mode: filter by the fixed set of breakdown values from the current period.
    query = baseOuter.clone()
      .where(inArray(col('breakdown_value'), param('Array(String)', fixedBreakdownValues)))
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
      .orderBy(col('breakdown_value'), 'ASC')
      .limit(MAX_BREAKDOWN_VALUES)
      .build();

    const topValuesRef = select(col('breakdown_value')).from('top_values').build();

    query = baseOuter.clone()
      .where(inSubquery(col('breakdown_value'), topValuesRef))
      .with('top_values', topValuesCte)
      .build();
  }

  const rows = await chx.rows<RawBreakdownRow>(query);
  return assembleRows(rows, params.metric, params.series, { isBreakdown: true });
}

// Public entry point

/** Maximum number of days allowed for hour granularity (7 days = 168 hour buckets). */
const MAX_HOURLY_RANGE_DAYS = 7;

export async function queryTrend(
  ch: ClickHouseClient,
  params: TrendQueryParams,
): Promise<TrendQueryResult> {
  // Validate max range for hour granularity
  if (params.granularity === 'hour') {
    const from = new Date(`${params.date_from}T00:00:00Z`);
    const to = new Date(`${params.date_to}T23:59:59Z`);
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_HOURLY_RANGE_DAYS) {
      throw new AppBadRequestException(
        `Hour granularity is limited to ${MAX_HOURLY_RANGE_DAYS} days. Current range: ${Math.ceil(diffDays)} days.`,
      );
    }
  }

  const chx = new ChQueryExecutor(ch);
  const currentSeries = await executeTrendQuery(chx, params, params.date_from, params.date_to);

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
          const bv = s.breakdown_value ?? '';
          // De-normalize: '(none)' was produced by normalizeBreakdownValue('') in assembleRows.
          // The actual ClickHouse stored value is '' — use it for the IN filter.
          return bv === '(none)' ? '' : bv;
        }),
      ),
    ];
  }

  let previousSeries = await executeTrendQuery(chx, params, prev.from, prev.to, fixedBreakdownValues);

  // Fill gaps for breakdown values absent in the previous period.
  if (hasPropertyBreakdown) {
    const prevIndex = new Set(
      previousSeries.map((s) => `${s.series_idx}::${s.breakdown_value ?? ''}`),
    );
    const gaps = currentSeries
      .filter((cur) => !prevIndex.has(`${cur.series_idx}::${cur.breakdown_value ?? ''}`))
      .map((cur) => ({
        series_idx: cur.series_idx,
        label: cur.label,
        event_name: cur.event_name,
        data: [],
        breakdown_value: cur.breakdown_value,
        ...(cur.breakdown_label !== undefined ? { breakdown_label: cur.breakdown_label } : {}),
      }));
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
