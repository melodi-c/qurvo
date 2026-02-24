import type { ClickHouseClient } from '@qurvo/clickhouse';

export interface EventNamesQueryParams {
  project_id: string;
}

export async function queryEventNames(
  ch: ClickHouseClient,
  params: EventNamesQueryParams,
): Promise<string[]> {
  const sql = `
    SELECT event_name, count() AS cnt
    FROM events FINAL
    WHERE
      project_id = {project_id:UUID}
      AND timestamp >= now() - INTERVAL 90 DAY
    GROUP BY event_name
    ORDER BY cnt DESC
    LIMIT 500
  `;

  const result = await ch.query({
    query: sql,
    query_params: { project_id: params.project_id },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ event_name: string; cnt: string }>();
  return rows.map((r) => r.event_name);
}

export interface EventNameWithCount {
  event_name: string;
  count: number;
}

export async function queryEventNamesWithCount(
  ch: ClickHouseClient,
  params: EventNamesQueryParams,
): Promise<EventNameWithCount[]> {
  const sql = `
    SELECT event_name, toUInt64(count()) AS cnt
    FROM events FINAL
    WHERE
      project_id = {project_id:UUID}
      AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY event_name
    ORDER BY cnt DESC
    LIMIT 500
  `;

  const result = await ch.query({
    query: sql,
    query_params: { project_id: params.project_id },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ event_name: string; cnt: string }>();
  return rows.map((r) => ({ event_name: r.event_name, count: parseInt(r.cnt, 10) }));
}
