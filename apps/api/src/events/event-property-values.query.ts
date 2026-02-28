import type { ClickHouseClient } from '@qurvo/clickhouse';
import { resolvePropertyExprStr } from '../analytics/query-helpers';
import { AppBadRequestException } from '../exceptions/app-bad-request.exception';

export interface PropertyValueRow {
  value: string;
  count: number;
}

export interface EventPropertyValuesParams {
  project_id: string;
  property_name: string;
  event_name?: string;
  limit?: number;
}

export async function queryEventPropertyValues(
  ch: ClickHouseClient,
  params: EventPropertyValuesParams,
): Promise<PropertyValueRow[]> {
  let propExpr: string;
  try {
    propExpr = resolvePropertyExprStr(params.property_name);
  } catch {
    throw new AppBadRequestException(`Unknown property: ${params.property_name}`);
  }

  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    limit: params.limit ?? 50,
  };

  const conditions: string[] = [`project_id = {project_id:UUID}`];

  if (params.event_name) {
    queryParams['event_name'] = params.event_name;
    conditions.push(`event_name = {event_name:String}`);
  }

  const query = `
    SELECT
      ${propExpr} AS value,
      count() AS count
    FROM events
    WHERE ${conditions.join(' AND ')}
      AND ${propExpr} != ''
    GROUP BY value
    ORDER BY count DESC
    LIMIT {limit:UInt32}
  `;

  const result = await ch.query({
    query,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ value: string; count: string }>();
  return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
}
