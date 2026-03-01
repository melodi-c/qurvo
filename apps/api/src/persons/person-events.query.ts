import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  compile,
  select,
  col,
  param,
  eq,
  or,
  dictGetOrNull,
  tuple,
} from '@qurvo/ch-query';
import { projectIs } from '../analytics/query-helpers';
import type { EventDetailRow } from '../events/events.query';
import { EVENT_BASE_COLUMNS } from '../events/events.query';

export interface PersonEventsQueryParams {
  project_id: string;
  person_id: string;
  limit: number;
  offset: number;
}

/**
 * Fetches the event timeline for a specific person.
 * Uses person_overrides_dict to include events from merged anonymous identities.
 */
export async function queryPersonEvents(
  ch: ClickHouseClient,
  params: PersonEventsQueryParams,
): Promise<EventDetailRow[]> {
  const personIdParam = param('UUID', params.person_id);

  const node = select(
    ...EVENT_BASE_COLUMNS,
    col('properties'),
    col('user_properties'),
  )
    .from('events')
    .where(
      projectIs(params.project_id),
      or(
        eq(col('events.person_id'), personIdParam),
        eq(
          dictGetOrNull('person_overrides_dict', 'person_id', tuple(col('project_id'), col('distinct_id'))),
          param('UUID', params.person_id),
        ),
      ),
    )
    .orderBy(col('events.timestamp'), 'DESC')
    .limit(params.limit)
    .offset(params.offset)
    .build();

  const { sql, params: queryParams } = compile(node);

  const result = await ch.query({
    query: sql,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  return result.json<EventDetailRow>();
}
