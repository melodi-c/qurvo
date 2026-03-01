import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  compile,
  select,
  col,
  literal,
  param,
  func,
  eq,
  gte,
  lte,
} from '@qurvo/ch-query';
import {
  analyticsWhere,
  projectIs,
  toChTs,
  type PropertyFilter,
} from '../analytics/query-helpers';

export interface EventsQueryParams {
  project_id: string;
  event_name?: string;
  filters?: PropertyFilter[];
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface EventRow {
  event_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  person_id: string;
  session_id: string;
  timestamp: string;
  // Page
  url: string;
  referrer: string;
  page_title: string;
  page_path: string;
  // Device & Browser
  device_type: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  screen_width: number;
  screen_height: number;
  // Geo
  country: string;
  region: string;
  city: string;
  // User context
  language: string;
  timezone: string;
  // SDK
  sdk_name: string;
  sdk_version: string;
}

export interface EventDetailRow extends EventRow {
  properties: string;
  user_properties: string;
}

/** ISO datetime format pattern for ClickHouse formatDateTime (UTC, milliseconds always `.000`). */
export const FORMAT_DATETIME_ISO = '%Y-%m-%dT%H:%i:%S.000Z';

/**
 * Base columns shared by events list and person events queries.
 * Each entry is a ch-query Expr (aliased where needed).
 */
export const EVENT_BASE_COLUMNS = [
  col('event_id'),
  col('event_name'),
  col('event_type'),
  col('distinct_id'),
  func('toString', col('person_id')).as('person_id'),
  col('session_id'),
  func('formatDateTime', col('events.timestamp'), literal(FORMAT_DATETIME_ISO), literal('UTC')).as('timestamp'),
  col('url'),
  col('referrer'),
  col('page_title'),
  col('page_path'),
  col('device_type'),
  col('browser'),
  col('browser_version'),
  col('os'),
  col('os_version'),
  col('screen_width'),
  col('screen_height'),
  col('country'),
  col('region'),
  col('city'),
  col('language'),
  col('timezone'),
  col('sdk_name'),
  col('sdk_version'),
];

// eslint-disable-next-line complexity -- dynamic query builder with optional filters
export async function queryEvents(
  ch: ClickHouseClient,
  params: EventsQueryParams,
): Promise<EventRow[]> {
  const now = new Date();
  const dateTo = params.date_to ?? now.toISOString().slice(0, 10);
  const dateFrom =
    params.date_from ??
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const validFilters = params.filters?.filter((f) => f.property?.trim()) ?? [];

  const whereExpr = analyticsWhere({
    projectId: params.project_id,
    from: dateFrom,
    to: toChTs(dateTo, true),
    eventName: params.event_name,
    filters: validFilters.length ? validFilters : undefined,
  });

  const node = select(...EVENT_BASE_COLUMNS)
    .from('events')
    .where(whereExpr)
    .orderBy(col('events.timestamp'), 'DESC')
    .limit(limit)
    .offset(offset)
    .build();

  const { sql, params: queryParams } = compile(node);

  const result = await ch.query({
    query: sql,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  return result.json<EventRow>();
}

interface EventDetailParams {
  project_id: string;
  event_id: string;
  timestamp: string;
}

export async function queryEventDetail(
  ch: ClickHouseClient,
  params: EventDetailParams,
): Promise<EventDetailRow | null> {
  const ms = new Date(params.timestamp).getTime();
  const tsFrom = new Date(ms - 5 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const tsTo = new Date(ms + 5 * 60_000).toISOString().slice(0, 19).replace('T', ' ');

  const node = select(
    ...EVENT_BASE_COLUMNS,
    col('properties'),
    col('user_properties'),
  )
    .from('events')
    .where(
      projectIs(params.project_id),
      eq(col('event_id'), param('UUID', params.event_id)),
      gte(col('events.timestamp'), param('DateTime', tsFrom)),
      lte(col('events.timestamp'), param('DateTime', tsTo)),
    )
    .limit(1)
    .build();

  const { sql, params: queryParams } = compile(node);

  const result = await ch.query({
    query: sql,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  const rows = await result.json<EventDetailRow>();
  return rows[0] ?? null;
}
