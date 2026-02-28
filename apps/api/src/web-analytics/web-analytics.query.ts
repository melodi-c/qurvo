import type { ClickHouseClient } from '@qurvo/clickhouse';
import { toChTs, RESOLVED_PERSON, granularityTruncExpr, shiftPeriod } from '../utils/clickhouse-helpers';
import { buildPropertyFilterConditions, type PropertyFilter } from '../utils/property-filter';
import { MAX_PATH_NODES } from '../constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WebAnalyticsGranularity = 'hour' | 'day' | 'week' | 'month';

export interface WebAnalyticsQueryParams {
  project_id: string;
  date_from: string;
  date_to: string;
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


function buildBaseQueryParams(params: WebAnalyticsQueryParams): Record<string, unknown> {
  return {
    project_id: params.project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
  };
}

function buildFilterConditions(
  filters: PropertyFilter[] | undefined,
  queryParams: Record<string, unknown>,
): string {
  if (!filters?.length) {return '';}
  const parts = buildPropertyFilterConditions(filters, 'wa', queryParams);
  return parts.length ? ' AND ' + parts.join(' AND ') : '';
}

function prepareQuery(params: WebAnalyticsQueryParams): { queryParams: Record<string, unknown>; filterConditions: string } {
  const queryParams = buildBaseQueryParams(params);
  const filterConditions = buildFilterConditions(params.filters, queryParams);
  return { queryParams, filterConditions };
}

/**
 * Lightweight session CTE for KPIs and timeseries.
 * Only computes metrics needed for overview — no dimension columns.
 */
function buildKpiSessionCTE(
  filterConditions: string,
): string {
  return `
    session_stats AS (
      SELECT
        session_id,
        countIf(event_name = '$pageview') AS pageview_count,
        min(timestamp) AS session_start,
        dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds,
        if(countIf(event_name = '$pageview') = 1
           AND dateDiff('second', min(timestamp), max(timestamp)) < 10, 1, 0) AS is_bounce,
        any(${RESOLVED_PERSON}) AS resolved_person
      FROM events
      WHERE project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name IN ('$pageview', '$pageleave')
        ${filterConditions}
      GROUP BY session_id
      HAVING pageview_count > 0
    )`;
}

/**
 * Session CTE with entry/exit page columns. Used only by paths query.
 */
function buildPathsSessionCTE(
  filterConditions: string,
): string {
  return `
    session_stats AS (
      SELECT
        session_id,
        countIf(event_name = '$pageview') AS pageview_count,
        argMinIf(page_path, timestamp, event_name = '$pageview') AS entry_page,
        argMaxIf(page_path, timestamp, event_name = '$pageview') AS exit_page,
        any(${RESOLVED_PERSON}) AS resolved_person
      FROM events
      WHERE project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name IN ('$pageview', '$pageleave')
        ${filterConditions}
      GROUP BY session_id
      HAVING pageview_count > 0
    )`;
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
  queryParams: Record<string, unknown>,
  filterConditions: string,
): Promise<WebAnalyticsKPIs> {
  const sql = `
    WITH ${buildKpiSessionCTE(filterConditions)}
    SELECT
      uniqExact(resolved_person) AS unique_visitors,
      sum(pageview_count) AS pageviews,
      count() AS sessions,
      avg(duration_seconds) AS avg_duration_seconds,
      avgIf(is_bounce, 1) AS bounce_rate
    FROM session_stats`;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawKPIRow>();
  return parseKPIs(rows[0]);
}

export async function queryOverview(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<OverviewResult> {
  const granularity = autoGranularity(params.date_from, params.date_to);
  const { queryParams, filterConditions } = prepareQuery(params);

  // Previous period params
  const prev = shiftPeriod(params.date_from, params.date_to);
  const prevParams: Record<string, unknown> = {
    ...queryParams,
    from: toChTs(prev.from),
    to: toChTs(prev.to, true),
  };

  // Timeseries SQL
  const bucketExpr = granularityTruncExpr(granularity, 'session_start');
  const tsSql = `
    WITH ${buildKpiSessionCTE(filterConditions)}
    SELECT
      ${bucketExpr} AS bucket,
      uniqExact(resolved_person) AS unique_visitors,
      sum(pageview_count) AS pageviews,
      count() AS sessions
    FROM session_stats
    GROUP BY bucket
    ORDER BY bucket ASC`;

  // Run all three independent queries in parallel
  const [current, previous, tsResult] = await Promise.all([
    queryKPIs(ch, { ...queryParams }, filterConditions),
    queryKPIs(ch, prevParams, filterConditions),
    ch.query({ query: tsSql, query_params: queryParams, format: 'JSONEachRow' }),
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
 * Session-based dimension query (heavy). Only used for entry_page / exit_page
 * which require argMinIf/argMaxIf across session events.
 */
async function querySessionDimension(
  ch: ClickHouseClient,
  queryParams: Record<string, unknown>,
  filterConditions: string,
  dimensionExpr: string,
  limit = 20,
): Promise<DimensionRow[]> {
  const dimParams = { ...queryParams, dim_limit: limit };
  const sql = `
    WITH ${buildPathsSessionCTE(filterConditions)}
    SELECT
      ${dimensionExpr} AS name,
      uniqExact(resolved_person) AS visitors,
      sum(pageview_count) AS pageviews
    FROM session_stats
    WHERE name != ''
    GROUP BY name
    ORDER BY visitors DESC
    LIMIT {dim_limit:UInt32}`;

  const result = await ch.query({ query: sql, query_params: dimParams, format: 'JSONEachRow' });
  return parseDimensionRows(await result.json<RawDimensionRow>());
}

/**
 * Direct event aggregation (lightweight). Used for simple column dimensions
 * (country, browser, os, device_type, referrer, utm_*) — no session grouping needed.
 * Reads only the dimension column + person_id, skipping all other columns.
 * Filters to $pageview only (pageleave needed only for session duration/bounce).
 */
async function queryDirectDimension(
  ch: ClickHouseClient,
  queryParams: Record<string, unknown>,
  filterConditions: string,
  columnExpr: string,
  limit = 20,
): Promise<DimensionRow[]> {
  const dimParams = { ...queryParams, dim_limit: limit };
  const sql = `
    SELECT
      ${columnExpr} AS name,
      uniqExact(${RESOLVED_PERSON}) AS visitors,
      count() AS pageviews
    FROM events
    WHERE project_id = {project_id:UUID}
      AND timestamp >= {from:DateTime64(3)}
      AND timestamp <= {to:DateTime64(3)}
      AND event_name = '$pageview'
      AND name != ''
      ${filterConditions}
    GROUP BY name
    ORDER BY visitors DESC
    LIMIT {dim_limit:UInt32}`;

  const result = await ch.query({ query: sql, query_params: dimParams, format: 'JSONEachRow' });
  return parseDimensionRows(await result.json<RawDimensionRow>());
}

// ── Paths Query ───────────────────────────────────────────────────────────────

export async function queryTopPages(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<PathsResult> {
  const { queryParams, filterConditions } = prepareQuery(params);

  const [top_pages, entry_pages, exit_pages] = await Promise.all([
    queryTopPagesDimension(ch, queryParams, filterConditions),
    querySessionDimension(ch, { ...queryParams }, filterConditions, 'entry_page'),
    querySessionDimension(ch, { ...queryParams }, filterConditions, 'exit_page'),
  ]);

  return { top_pages, entry_pages, exit_pages };
}

async function queryTopPagesDimension(
  ch: ClickHouseClient,
  queryParams: Record<string, unknown>,
  filterConditions: string,
): Promise<DimensionRow[]> {
  // Top pages aggregated from individual pageview events, not sessions
  const sql = `
    SELECT
      page_path AS name,
      uniqExact(${RESOLVED_PERSON}) AS visitors,
      count() AS pageviews
    FROM events
    WHERE project_id = {project_id:UUID}
      AND timestamp >= {from:DateTime64(3)}
      AND timestamp <= {to:DateTime64(3)}
      AND event_name = '$pageview'
      AND page_path != ''
      ${filterConditions}
    GROUP BY name
    ORDER BY pageviews DESC
    LIMIT ${MAX_PATH_NODES}`;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawDimensionRow>();
  return rows.map((r) => ({
    name: r.name,
    visitors: Number(r.visitors),
    pageviews: Number(r.pageviews),
  }));
}

// ── Sources Query ─────────────────────────────────────────────────────────────

export async function querySources(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<SourcesResult> {
  const { queryParams, filterConditions } = prepareQuery(params);

  const [referrers, utm_sources, utm_mediums, utm_campaigns] = await Promise.all([
    queryDirectDimension(ch, { ...queryParams }, filterConditions, 'referrer'),
    queryDirectDimension(ch, { ...queryParams }, filterConditions, `JSONExtractString(properties, 'utm_source')`),
    queryDirectDimension(ch, { ...queryParams }, filterConditions, `JSONExtractString(properties, 'utm_medium')`),
    queryDirectDimension(ch, { ...queryParams }, filterConditions, `JSONExtractString(properties, 'utm_campaign')`),
  ]);

  return { referrers, utm_sources, utm_mediums, utm_campaigns };
}

// ── Devices Query ─────────────────────────────────────────────────────────────

export async function queryDevices(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<DevicesResult> {
  const { queryParams, filterConditions } = prepareQuery(params);

  const [device_types, browsers, oses] = await Promise.all([
    queryDirectDimension(ch, { ...queryParams }, filterConditions, 'device_type'),
    queryDirectDimension(ch, { ...queryParams }, filterConditions, 'browser'),
    queryDirectDimension(ch, { ...queryParams }, filterConditions, 'os'),
  ]);

  return { device_types, browsers, oses };
}

// ── Geography Query ───────────────────────────────────────────────────────────

export async function queryGeography(
  ch: ClickHouseClient,
  params: WebAnalyticsQueryParams,
): Promise<GeographyResult> {
  const { queryParams, filterConditions } = prepareQuery(params);

  const [countries, regions, cities] = await Promise.all([
    queryDirectDimension(ch, { ...queryParams }, filterConditions, 'country'),
    queryDirectDimension(ch, { ...queryParams }, filterConditions, 'region'),
    queryDirectDimension(ch, { ...queryParams }, filterConditions, 'city'),
  ]);

  return { countries, regions, cities };
}
