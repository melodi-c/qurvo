import type { ClickHouseClient } from '@qurvo/clickhouse';

export interface PersonEventsQueryParams {
  project_id: string;
  person_id: string;
  limit: number;
  offset: number;
}

export interface PersonEventRow {
  event_id: string;
  event_name: string;
  event_type: string;
  distinct_id: string;
  person_id: string;
  session_id: string;
  timestamp: string;
  url: string;
  referrer: string;
  page_title: string;
  page_path: string;
  device_type: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  screen_width: number;
  screen_height: number;
  country: string;
  region: string;
  city: string;
  language: string;
  timezone: string;
  sdk_name: string;
  sdk_version: string;
  properties: string;
  user_properties: string;
}

/**
 * Fetches the event timeline for a specific person.
 * Uses person_overrides_dict to include events from merged anonymous identities.
 */
export async function queryPersonEvents(
  ch: ClickHouseClient,
  params: PersonEventsQueryParams,
): Promise<PersonEventRow[]> {
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
    FROM events FINAL
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

  return result.json<PersonEventRow>();
}
