import type { ClickHouseClient } from '@qurvo/clickhouse';
import { DIRECT_COLUMNS } from '../utils/property-filter';

export interface EventPropertyNamesQueryParams {
  project_id: string;
}

export async function queryEventPropertyNames(
  ch: ClickHouseClient,
  params: EventPropertyNamesQueryParams,
): Promise<string[]> {
  const sql = `
    SELECT DISTINCT key
    FROM (
      SELECT concat('properties.', arrayJoin(JSONExtractKeys(properties))) AS key
      FROM events FINAL
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= now() - INTERVAL 90 DAY
        AND properties != '{}'

      UNION ALL

      SELECT concat('user_properties.', arrayJoin(JSONExtractKeys(user_properties))) AS key
      FROM events FINAL
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= now() - INTERVAL 90 DAY
        AND user_properties != '{}'
    )
    ORDER BY key
    LIMIT 500
  `;

  const result = await ch.query({
    query: sql,
    query_params: { project_id: params.project_id },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ key: string }>();
  const jsonKeys = rows.map((r) => r.key);

  // Prepend direct columns (country, browser, etc.) so they appear first
  const directCols = [...DIRECT_COLUMNS].sort();
  return [...directCols, ...jsonKeys];
}
