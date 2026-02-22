import type { ClickHouseClient } from '@qurvo/clickhouse';

export interface PropertyNameWithCount {
  property_name: string;
  property_type: 'event' | 'person';
  count: number;
}

export async function queryPropertyNamesWithCount(
  ch: ClickHouseClient,
  params: { project_id: string; event_name?: string },
): Promise<PropertyNameWithCount[]> {
  const eventFilter = params.event_name
    ? `AND event_name = {event_name:String}`
    : '';

  const sql = `
    SELECT property_name, property_type, cnt
    FROM (
      SELECT
        concat('properties.', key) AS property_name,
        'event' AS property_type,
        toUInt64(count()) AS cnt
      FROM (
        SELECT arrayJoin(JSONExtractKeys(properties)) AS key
        FROM events
        WHERE
          project_id = {project_id:UUID}
          AND timestamp >= now() - INTERVAL 30 DAY
          AND properties != '{}'
          ${eventFilter}
      )
      GROUP BY key

      UNION ALL

      SELECT
        concat('user_properties.', key) AS property_name,
        'person' AS property_type,
        toUInt64(count()) AS cnt
      FROM (
        SELECT arrayJoin(JSONExtractKeys(user_properties)) AS key
        FROM events
        WHERE
          project_id = {project_id:UUID}
          AND timestamp >= now() - INTERVAL 30 DAY
          AND user_properties != '{}'
          ${eventFilter}
      )
      GROUP BY key
    )
    ORDER BY cnt DESC
    LIMIT 500
  `;

  const query_params: Record<string, string> = { project_id: params.project_id };
  if (params.event_name) query_params.event_name = params.event_name;

  const result = await ch.query({
    query: sql,
    query_params,
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ property_name: string; property_type: 'event' | 'person'; cnt: string }>();
  return rows.map((r) => ({
    property_name: r.property_name,
    property_type: r.property_type,
    count: parseInt(r.cnt, 10),
  }));
}
