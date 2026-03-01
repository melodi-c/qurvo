import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { Expr } from '@qurvo/ch-query';
import {
  alias,
  compile,
  select,
  col,
  literal,
  count,
  countIf,
  uniqExact,
  sum,
  avg,
  avgIf,
  min,
  max,
  any,
  dateDiff,
  argMinIf,
  argMaxIf,
  eq,
  neq,
  and,
  gt,
  jsonExtractString,
  ifExpr,
} from '@qurvo/ch-query';
import {
  analyticsWhere,
  resolvedPerson,
  bucket,
  toChTs,
  shiftPeriod,
  type PropertyFilter,
} from '../analytics/query-helpers';
import { MAX_PATH_NODES } from '../constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WebAnalyticsGranularity = 'hour' | 'day' | 'week' | 'month';

export interface WebAnalyticsQueryParams {
  project_id: string;
  date_from: string;
  date_to: string;
  timezone?: string;
  filters?: PropertyFilter[];
}

export interface WebAnalyticsKPIs {
  unique_visitors: number;
  pageviews: number;
  sessions: number;
  avg_duration_seconds: number;
  bounce_rate: number;
}

export interface TimeseriesPoint {
  bucket: string;
  unique_visitors: number;
  pageviews: number;
  sessions: number;
}

export interface OverviewResult {
  current: WebAnalyticsKPIs;
  previous: WebAnalyticsKPIs;
  timeseries: TimeseriesPoint[];
  granularity: WebAnalyticsGranularity;
}

export interface DimensionRow {
  name: string;
  visitors: number;
  pageviews: number;
}

export interface PathsResult {
  top_pages: DimensionRow[];
  entry_pages: DimensionRow[];
  exit_pages: DimensionRow[];
}

export interface SourcesResult {
  referrers: DimensionRow[];
  utm_sources: DimensionRow[];
  utm_mediums: DimensionRow[];
  utm_campaigns: DimensionRow[];
}

export interface DevicesResult {
  device_types: DimensionRow[];
  browsers: DimensionRow[];
  oses: DimensionRow[];
}

export interface GeographyResult {
  countries: DimensionRow[];
  regions: DimensionRow[];
  cities: DimensionRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function autoGranularity(dateFrom: string, dateTo: string): WebAnalyticsGranularity {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 2) {return 'hour';}
  if (diffDays <= 89) {return 'day';}
  if (diffDays <= 364) {return 'week';}
  return 'month';
}

/**
 * Shared WHERE clause for web-analytics queries.
 * project_id + time range + event IN ($pageview, $pageleave) + optional filters.
 */
function waWhere(params: WebAnalyticsQueryParams): Expr {
  return analyticsWhere({
    projectId: params.project_id,
    from: params.date_from,
    to: toChTs(params.date_to, true),
    tz: params.timezone,
    eventNames: ['$pageview', '$pageleave'],
    filters: params.filters,
  });
}

/**
 * Shared WHERE clause for direct-dimension queries ($pageview only).
 */
function waWherePageview(params: WebAnalyticsQueryParams): Expr {
  return analyticsWhere({
    projectId: params.project_id,
    from: params.date_from,
    to: toChTs(params.date_to, true),
    tz: params.timezone,
    eventName: '$pageview',
    filters: params.filters,
  });
}

// ── KPI Session CTE ─────────────────────────────────────────────────────────

/**
 * Lightweight session CTE for KPIs and timeseries.
 * Returns: session_id, pageview_count, session_start, duration_seconds, is_bounce, resolved_person
 */
function buildKpiSessionCTE(params: WebAnalyticsQueryParams) {
  const pageviewCond = eq(col('event_name'), literal('$pageview'));
  return select(
    col('session_id'),
    countIf(pageviewCond).as('pageview_count'),
    min(col('timestamp')).as('session_start'),
    dateDiff('second', min(col('timestamp')), max(col('timestamp'))).as('duration_seconds'),
    ifExpr(
      and(
        eq(countIf(pageviewCond), literal(1)),
        gt(literal(10), dateDiff('second', min(col('timestamp')), max(col('timestamp')))),
      ),
      literal(1),
      literal(0),
    ).as('is_bounce'),
    any(resolvedPerson()).as('resolved_person'),
  )
    .from('events')
    .where(waWhere(params))
    .groupBy(col('session_id'))
    .having(gt(col('pageview_count'), literal(0)))
    .build();
}

/**
 * Session CTE with entry/exit page columns. Used only by paths query.
 */
function buildPathsSessionCTE(params: WebAnalyticsQueryParams) {
  const pageviewCond = eq(col('event_name'), literal('$pageview'));
  return select(
    col('session_id'),
    countIf(pageviewCond).as('pageview_count'),
    argMinIf(col('page_path'), col('timestamp'), pageviewCond).as('entry_page'),
    argMaxIf(col('page_path'), col('timestamp'), pageviewCond).as('exit_page'),
    any(resolvedPerson()).as('resolved_person'),
  )
    .from('events')
    .where(waWhere(params))
    .groupBy(col('session_id'))
    .having(gt(col('pageview_count'), literal(0)))
    .build();
}

// ── Overview Query ────────────────────────────────────────────────────────────

interface RawKPIRow {
  unique_visitors: string;
  pageviews: string;
  sessions: string;
  avg_duration_seconds: string;
  bounce_rate: string;
}

interface RawTimeseriesRow {
  bucket: string;
  unique_visitors: string;
  pageviews: string;
  sessions: string;
}

function parseKPIs(row: RawKPIRow | undefined): WebAnalyticsKPIs {
  if (!row) {return { unique_visitors: 0, pageviews: 0, sessions: 0, avg_duration_seconds: 0, bounce_rate: 0 };}
  return {
    unique_visitors: Number(row.unique_visitors),
    pageviews: Number(row.pageviews),
    sessions: Number(row.sessions),
    avg_duration_seconds: Math.round(Number(row.avg_duration_seconds)),
    bounce_rate: Math.round(Number(row.bounce_rate) * 10000) / 100,
  };
}

async function queryKPIs(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<WebAnalyticsKPIs> {
  const kpiNode = select(
    uniqExact(col('resolved_person')).as('unique_visitors'),
    sum(col('pageview_count')).as('pageviews'),
    count().as('sessions'),
    avg(col('duration_seconds')).as('avg_duration_seconds'),
    avgIf(col('is_bounce'), literal(1)).as('bounce_rate'),
  )
    .from('session_stats')
    .with('session_stats', buildKpiSessionCTE(params))
    .build();

  const { sql, params: queryParams } = compile(kpiNode);
  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawKPIRow>();
  return parseKPIs(rows[0]);
}

export async function queryOverview(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<OverviewResult> {
  const granularity = autoGranularity(params.date_from, params.date_to);

  // Previous period params
  const prev = shiftPeriod(params.date_from, params.date_to);
  const prevParams: WebAnalyticsQueryParams = {
    ...params,
    date_from: prev.from,
    date_to: prev.to,
  };

  // Timeseries query
  const bucketExpr = bucket(granularity, 'session_start', params.timezone);
  const tsNode = select(
    bucketExpr.as('bucket'),
    uniqExact(col('resolved_person')).as('unique_visitors'),
    sum(col('pageview_count')).as('pageviews'),
    count().as('sessions'),
  )
    .from('session_stats')
    .with('session_stats', buildKpiSessionCTE(params))
    .groupBy(col('bucket'))
    .orderBy(col('bucket'), 'ASC')
    .build();

  const tsCompiled = compile(tsNode);

  // Run all three independent queries in parallel
  const [current, previous, tsResult] = await Promise.all([
    queryKPIs(ch, params),
    queryKPIs(ch, prevParams),
    ch.query({ query: tsCompiled.sql, query_params: tsCompiled.params, format: 'JSONEachRow' }),
  ]);

  const tsRows = await tsResult.json<RawTimeseriesRow>();
  const timeseries: TimeseriesPoint[] = tsRows.map((r) => ({
    bucket: r.bucket,
    unique_visitors: Number(r.unique_visitors),
    pageviews: Number(r.pageviews),
    sessions: Number(r.sessions),
  }));

  return { current, previous, timeseries, granularity };
}

// ── Dimension Query Helpers ───────────────────────────────────────────────────

interface RawDimensionRow {
  name: string;
  visitors: string;
  pageviews: string;
}

function parseDimensionRows(rows: RawDimensionRow[]): DimensionRow[] {
  return rows.map((r) => ({
    name: r.name,
    visitors: Number(r.visitors),
    pageviews: Number(r.pageviews),
  }));
}

/**
 * Session-based dimension query. Used for entry_page / exit_page
 * which require argMinIf/argMaxIf across session events.
 */
async function querySessionDimension(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
  dimensionExpr: string,
  limit = 20,
): Promise<DimensionRow[]> {
  const node = select(
    col(dimensionExpr).as('name'),
    uniqExact(col('resolved_person')).as('visitors'),
    sum(col('pageview_count')).as('pageviews'),
  )
    .from('session_stats')
    .with('session_stats', buildPathsSessionCTE(params))
    .where(neq(col('name'), literal('')))
    .groupBy(col('name'))
    .orderBy(col('visitors'), 'DESC')
    .limit(limit)
    .build();

  const { sql, params: queryParams } = compile(node);
  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  return parseDimensionRows(await result.json<RawDimensionRow>());
}

/**
 * Direct event aggregation (lightweight). Used for simple column dimensions
 * (country, browser, os, device_type, referrer, utm_*) — no session grouping needed.
 * Filters to $pageview only.
 */
async function queryDirectDimension(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
  columnExpr: Expr,
  limit = 20,
): Promise<DimensionRow[]> {
  const node = select(
    alias(columnExpr, 'name'),
    uniqExact(resolvedPerson()).as('visitors'),
    count().as('pageviews'),
  )
    .from('events')
    .where(
      waWherePageview(params),
      neq(col('name'), literal('')),
    )
    .groupBy(col('name'))
    .orderBy(col('visitors'), 'DESC')
    .limit(limit)
    .build();

  const { sql, params: queryParams } = compile(node);
  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  return parseDimensionRows(await result.json<RawDimensionRow>());
}

// ── Paths Query ───────────────────────────────────────────────────────────────

export async function queryTopPages(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<PathsResult> {
  const [top_pages, entry_pages, exit_pages] = await Promise.all([
    queryTopPagesDimension(ch, params),
    querySessionDimension(ch, params, 'entry_page'),
    querySessionDimension(ch, params, 'exit_page'),
  ]);

  return { top_pages, entry_pages, exit_pages };
}

async function queryTopPagesDimension(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<DimensionRow[]> {
  const node = select(
    col('page_path').as('name'),
    uniqExact(resolvedPerson()).as('visitors'),
    count().as('pageviews'),
  )
    .from('events')
    .where(
      waWherePageview(params),
      neq(col('page_path'), literal('')),
    )
    .groupBy(col('name'))
    .orderBy(col('pageviews'), 'DESC')
    .limit(MAX_PATH_NODES)
    .build();

  const { sql, params: queryParams } = compile(node);
  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  return parseDimensionRows(await result.json<RawDimensionRow>());
}

// ── Sources Query ─────────────────────────────────────────────────────────────

export async function querySources(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<SourcesResult> {
  const [referrers, utm_sources, utm_mediums, utm_campaigns] = await Promise.all([
    queryDirectDimension(ch, params, col('referrer')),
    queryDirectDimension(ch, params, jsonExtractString(col('properties'), 'utm_source')),
    queryDirectDimension(ch, params, jsonExtractString(col('properties'), 'utm_medium')),
    queryDirectDimension(ch, params, jsonExtractString(col('properties'), 'utm_campaign')),
  ]);

  return { referrers, utm_sources, utm_mediums, utm_campaigns };
}

// ── Devices Query ─────────────────────────────────────────────────────────────

export async function queryDevices(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<DevicesResult> {
  const [device_types, browsers, oses] = await Promise.all([
    queryDirectDimension(ch, params, col('device_type')),
    queryDirectDimension(ch, params, col('browser')),
    queryDirectDimension(ch, params, col('os')),
  ]);

  return { device_types, browsers, oses };
}

// ── Geography Query ───────────────────────────────────────────────────────────

export async function queryGeography(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<GeographyResult> {
  const [countries, regions, cities] = await Promise.all([
    queryDirectDimension(ch, params, col('country')),
    queryDirectDimension(ch, params, col('region')),
    queryDirectDimension(ch, params, col('city')),
  ]);

  return { countries, regions, cities };
}
