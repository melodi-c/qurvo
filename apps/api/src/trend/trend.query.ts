import type { ClickHouseClient } from '@shot/clickhouse';
import type { CohortDefinition } from '@shot/db';
import { buildCohortFilterClause } from '../cohorts/cohorts.query';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toChTs(iso: string, endOfDay = false): string {
  if (iso.length === 10 && endOfDay) return `${iso} 23:59:59`;
  return iso.replace('T', ' ').replace('Z', '');
}

const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('shot_analytics.person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

const TOP_LEVEL_COLUMNS = new Set([
  'country', 'region', 'city', 'device_type', 'browser',
  'browser_version', 'os', 'os_version', 'language',
]);

function resolvePropertyExpr(prop: string): string {
  if (prop.startsWith('properties.')) {
    const key = prop.slice('properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(properties, '${key}')`;
  }
  if (prop.startsWith('user_properties.')) {
    const key = prop.slice('user_properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(user_properties, '${key}')`;
  }
  if (TOP_LEVEL_COLUMNS.has(prop)) return prop;
  return prop;
}

function granularityExpr(g: TrendGranularity): string {
  switch (g) {
    case 'hour':  return 'toStartOfHour(timestamp)';
    case 'day':   return 'toStartOfDay(timestamp)';
    case 'week':  return 'toStartOfWeek(timestamp, 1)';
    case 'month': return 'toStartOfMonth(timestamp)';
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

export type TrendMetric = 'total_events' | 'unique_users' | 'events_per_user';
export type TrendGranularity = 'hour' | 'day' | 'week' | 'month';

export interface TrendFilter {
  property: string;
  operator: 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';
  value?: string;
}

export interface TrendSeries {
  event_name: string;
  label: string;
  filters?: TrendFilter[];
}

export interface TrendQueryParams {
  project_id: string;
  series: TrendSeries[];
  metric: TrendMetric;
  granularity: TrendGranularity;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  compare?: boolean;
  cohort_filters?: CohortDefinition[];
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
  const parts: string[] = [`event_name = {s${idx}_event:String}`];
  queryParams[`s${idx}_event`] = series.event_name;

  for (const [j, f] of (series.filters ?? []).entries()) {
    const expr = resolvePropertyExpr(f.property);
    const pk = `s${idx}_f${j}_v`;
    switch (f.operator) {
      case 'eq':
        queryParams[pk] = f.value ?? '';
        parts.push(`${expr} = {${pk}:String}`);
        break;
      case 'neq':
        queryParams[pk] = f.value ?? '';
        parts.push(`${expr} != {${pk}:String}`);
        break;
      case 'contains':
        queryParams[pk] = `%${f.value ?? ''}%`;
        parts.push(`${expr} LIKE {${pk}:String}`);
        break;
      case 'not_contains':
        queryParams[pk] = `%${f.value ?? ''}%`;
        parts.push(`${expr} NOT LIKE {${pk}:String}`);
        break;
      case 'is_set':
        parts.push(`${expr} != ''`);
        break;
      case 'is_not_set':
        parts.push(`(${expr} = '' OR isNull(${expr}))`);
        break;
    }
  }
  return parts.join(' AND ');
}

// ── Period shift for compare ──────────────────────────────────────────────────

function shiftPeriod(dateFrom: string, dateTo: string): { from: string; to: string } {
  const from = new Date(dateFrom);
  const to = new Date(`${dateTo}T23:59:59Z`);
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1000);
  const prevFrom = new Date(from.getTime() - durationMs - 1000);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

// ── Raw row types from ClickHouse ─────────────────────────────────────────────

interface RawTrendRow {
  series_idx: string;
  bucket: string;
  raw_value: string;
  uniq_value: string;
}

interface RawBreakdownRow extends RawTrendRow {
  breakdown_value: string;
}

// ── Result assembly ───────────────────────────────────────────────────────────

function assembleValue(metric: TrendMetric, raw: string, uniq: string): number {
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
      value: assembleValue(metric, row.raw_value, row.uniq_value),
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
      value: assembleValue(metric, row.raw_value, row.uniq_value),
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

  const bucketExpr = granularityExpr(params.granularity);
  const hasBreakdown = !!params.breakdown_property;

  // Cohort filter clause
  const cohortClause = params.cohort_filters?.length
    ? ' AND ' + buildCohortFilterClause(params.cohort_filters, 'project_id', queryParams)
    : '';

  if (!hasBreakdown) {
    const arms = params.series.map((s, idx) => {
      const cond = buildSeriesConditions(s, idx, queryParams);
      return `
        SELECT
          ${idx} AS series_idx,
          ${bucketExpr} AS bucket,
          count() AS raw_value,
          uniqExact(${RESOLVED_PERSON}) AS uniq_value
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
        uniqExact(${RESOLVED_PERSON}) AS uniq_value
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
    SELECT series_idx, breakdown_value, bucket, raw_value, uniq_value
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

  if (!params.compare) {
    if (!params.breakdown_property) {
      return { compare: false, breakdown: false, series: currentSeries };
    }
    return {
      compare: false,
      breakdown: true,
      breakdown_property: params.breakdown_property,
      series: currentSeries,
    };
  }

  const prev = shiftPeriod(params.date_from, params.date_to);
  const previousSeries = await executeTrendQuery(ch, params, prev.from, prev.to);

  if (!params.breakdown_property) {
    return { compare: true, breakdown: false, series: currentSeries, series_previous: previousSeries };
  }
  return {
    compare: true,
    breakdown: true,
    breakdown_property: params.breakdown_property,
    series: currentSeries,
    series_previous: previousSeries,
  };
}
