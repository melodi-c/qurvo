import type { ClickHouseClient } from '@shot/clickhouse';

export interface EventsQueryParams {
  project_id: string;
  event_name?: string;
  distinct_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface EventRow {
  event_id: string;
  event_name: string;
  distinct_id: string;
  timestamp: string;
  url: string;
  properties: string;
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

  const conditions: string[] = [
    `project_id = {project_id: UUID}`,
    `timestamp >= parseDateTimeBestEffort({date_from: String})`,
    `timestamp < parseDateTimeBestEffort({date_to: String}) + INTERVAL 1 DAY`,
  ];

  if (params.event_name) {
    conditions.push(`event_name = {event_name: String}`);
  }
  if (params.distinct_id) {
    conditions.push(`distinct_id = {distinct_id: String}`);
  }

  const query = `
    SELECT
      event_id,
      event_name,
      distinct_id,
      formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.000Z') AS timestamp,
      JSONExtractString(properties, 'url') AS url,
      properties
    FROM events FINAL
    WHERE ${conditions.join(' AND ')}
    ORDER BY timestamp DESC
    LIMIT {limit: UInt32}
    OFFSET {offset: UInt32}
  `;

  const result = await ch.query({
    query,
    query_params: {
      project_id: params.project_id,
      date_from: dateFrom,
      date_to: dateTo,
      ...(params.event_name ? { event_name: params.event_name } : {}),
      ...(params.distinct_id ? { distinct_id: params.distinct_id } : {}),
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
    format: 'JSONEachRow',
  });

  return result.json<EventRow>();
}
