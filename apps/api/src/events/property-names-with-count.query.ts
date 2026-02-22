import type { ClickHouseClient } from '@qurvo/clickhouse';

export interface PropertyNameWithCount {
  property_name: string;
  property_type: 'event' | 'person';
  count: number;
}

export async function queryPropertyNamesWithCount(
  ch: ClickHouseClient,
  params: { project_id: string },
): Promise<PropertyNameWithCount[]> {
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
      )
      GROUP BY key
    )
    ORDER BY cnt DESC
    LIMIT 500
  `;

  const result = await ch.query({
    query: sql,
    query_params: { project_id: params.project_id },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ property_name: string; property_type: 'event' | 'person'; cnt: string }>();
  return rows.map((r) => ({
    property_name: r.property_name,
    property_type: r.property_type,
    count: parseInt(r.cnt, 10),
  }));
}
