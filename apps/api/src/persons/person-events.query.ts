import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { EventDetailRow } from '../events/events.query';

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
  const query = `
    SELECT
      event_id,
      event_name,
      event_type,
      distinct_id,
      toString(events.person_id) AS person_id,
      session_id,
      formatDateTime(events.timestamp, '%Y-%m-%dT%H:%i:%S.000Z', 'UTC') AS timestamp,
      url,
      referrer,
      page_title,
      page_path,
      device_type,
      browser,
      browser_version,
      os,
      os_version,
      screen_width,
      screen_height,
      country,
      region,
      city,
      language,
      timezone,
      sdk_name,
      sdk_version,
      properties,
      user_properties
    FROM events
    WHERE
      project_id = {project_id:UUID}
      AND (
        events.person_id = {person_id:UUID}
        OR dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)) = {person_id:UUID}
      )
    ORDER BY events.timestamp DESC
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

  return result.json<EventDetailRow>();
}
