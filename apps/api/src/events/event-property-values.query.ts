import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import {
  alias,
  col,
  select,
  literal,
  count,
  neq,
} from '@qurvo/ch-query';
import {
  resolvePropertyExpr,
  projectIs,
  eventIs,
} from '../analytics/query-helpers';
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
  let propExpr;
  try {
    propExpr = resolvePropertyExpr(params.property_name);
  } catch {
    throw new AppBadRequestException(`Unknown property: ${params.property_name}`);
  }

  const limit = params.limit ?? 50;

  const builder = select(
    alias(propExpr, 'value'),
    count().as('count'),
  )
    .from('events')
    .where(
      projectIs(params.project_id),
      params.event_name ? eventIs(params.event_name) : undefined,
      neq(propExpr, literal('')),
    )
    .groupBy(col('value'))
    .orderBy(col('count'), 'DESC')
    .limit(limit);

  const rows = await new ChQueryExecutor(ch).rows<{ value: string; count: string }>(builder.build());
  return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
}
