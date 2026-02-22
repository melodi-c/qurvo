import type { ClickHouseClient } from '@qurvo/clickhouse';
import { DIRECT_COLUMNS } from '../utils/property-filter';

export interface EventPropertyNamesQueryParams {
  project_id: string;
  event_name?: string;
}

export async function queryEventPropertyNames(
  ch: ClickHouseClient,
  params: EventPropertyNamesQueryParams,
): Promise<string[]> {
  const eventFilter = params.event_name
    ? `AND event_name = {event_name:String}`
    : '';

  const sql = `
    SELECT DISTINCT key
    FROM (
      SELECT concat('properties.', arrayJoin(JSONExtractKeys(properties))) AS key
      FROM events FINAL
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= now() - INTERVAL 90 DAY
        AND properties != '{}'
        ${eventFilter}

      UNION ALL

      SELECT concat('user_properties.', arrayJoin(JSONExtractKeys(user_properties))) AS key
      FROM events FINAL
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= now() - INTERVAL 90 DAY
        AND user_properties != '{}'
        ${eventFilter}
    )
    ORDER BY key
    LIMIT 500
  `;

  const query_params: Record<string, string> = { project_id: params.project_id };
  if (params.event_name) query_params.event_name = params.event_name;

  const result = await ch.query({
    query: sql,
    query_params,
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ key: string }>();
  const jsonKeys = rows.map((r) => r.key);

  // Prepend direct columns (country, browser, etc.) so they appear first
  const directCols = [...DIRECT_COLUMNS].sort();
  return [...directCols, ...jsonKeys];
}
