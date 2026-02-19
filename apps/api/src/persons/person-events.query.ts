import type { ClickHouseClient } from '@shot/clickhouse';

export interface PersonEventsQueryParams {
  project_id: string;
  person_id: string;
  limit: number;
  offset: number;
}

export interface PersonEventRow {
  event_id: string;
  event_name: string;
  distinct_id: string;
  timestamp: string;
  url: string;
  properties: string;
}

/**
 * Fetches the event timeline for a specific person.
 * Uses RESOLVED_PERSON to include events from merged anonymous identities.
 */
export async function queryPersonEvents(
  ch: ClickHouseClient,
  params: PersonEventsQueryParams,
): Promise<PersonEventRow[]> {
  const query = `
    SELECT
      event_id,
      event_name,
      distinct_id,
      formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.000Z') AS timestamp,
      JSONExtractString(properties, 'url') AS url,
      properties
    FROM events FINAL
    WHERE
      project_id = {project_id:UUID}
      AND (
        person_id = {person_id:UUID}
        OR dictGetOrNull('shot_analytics.person_overrides_dict', 'person_id', (project_id, distinct_id)) = {person_id:UUID}
      )
    ORDER BY timestamp DESC
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

  const result = await ch.query({
    query,
    query_params: {
      project_id: params.project_id,
      person_id: params.person_id,
      limit: params.limit,
      offset: params.offset,
    },
    format: 'JSONEachRow',
  });

  return result.json<PersonEventRow>();
}
