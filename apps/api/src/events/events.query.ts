import type { ClickHouseClient } from '@qurvo/clickhouse';
import { buildPropertyFilterConditions, type PropertyFilter } from '../utils/property-filter';

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
  // Properties (JSON strings)
  properties: string;
  user_properties: string;
}

export async function queryEvents(
  ch: ClickHouseClient,
  params: EventsQueryParams,
): Promise<EventRow[]> {
  const now = new Date();
  const dateTo = params.date_to ?? now.toISOString().slice(0, 10);
  const dateFrom =
    params.date_from ??
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    date_from: dateFrom,
    date_to: dateTo,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  };

  const conditions: string[] = [
    `project_id = {project_id:UUID}`,
    `events.timestamp >= parseDateTimeBestEffort({date_from:String})`,
    `events.timestamp < parseDateTimeBestEffort({date_to:String}) + INTERVAL 1 DAY`,
  ];

  if (params.event_name) {
    queryParams['event_name'] = params.event_name;
    conditions.push(`event_name = {event_name:String}`);
  }

  if (params.filters?.length) {
    const validFilters = params.filters.filter((f) => f.property.trim() !== '');
    conditions.push(...buildPropertyFilterConditions(validFilters, 'ev', queryParams));
  }

  const query = `
    SELECT
      event_id,
      event_name,
      event_type,
      distinct_id,
      toString(person_id) AS person_id,
      session_id,
      formatDateTime(events.timestamp, '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS timestamp,
      url,
      referrer,
      page_title,
      page_path,
      device_type,
      browser,
      browser_version,
      os,
      os_version,
      screen_width,
      screen_height,
      country,
      region,
      city,
      language,
      timezone,
      sdk_name,
      sdk_version,
      properties,
      user_properties
    FROM events FINAL
    WHERE ${conditions.join(' AND ')}
    ORDER BY events.timestamp DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

  const result = await ch.query({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  return result.json<EventRow>();
}
