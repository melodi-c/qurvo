import type { ClickHouseClient, Event } from '@shot/clickhouse';

/** Converts an ISO 8601 timestamp to the format ClickHouse expects for DateTime64(3) parameters. */
function toChTs(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '');
}

/**
 * Resolves the canonical person_id for each event using the overrides dictionary.
 * - If an override exists (e.g. anonymous user was later identified), use that person_id.
 * - Otherwise fall back to the person_id stamped on the event at ingestion time.
 *
 * This implements PostHog-style "Persons on Events" identity stitching without JOINs.
 */
const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('shot_analytics.person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

export async function queryEvents(
  ch: ClickHouseClient,
  params: {
    project_id: string;
    event_name?: string;
    distinct_id?: string;
    from?: string;
    to?: string;
    limit: number;
    offset: number;
  },
) {
  const conditions = ['project_id = {project_id:UUID}'];
  const queryParams: Record<string, string | number> = { project_id: params.project_id };

  if (params.event_name) {
    conditions.push('event_name = {event_name:String}');
    queryParams.event_name = params.event_name;
  }
  if (params.distinct_id) {
    conditions.push('distinct_id = {distinct_id:String}');
    queryParams.distinct_id = params.distinct_id;
  }
  if (params.from) {
    conditions.push('timestamp >= {from:DateTime64(3)}');
    queryParams.from = toChTs(params.from);
  }
  if (params.to) {
    conditions.push('timestamp <= {to:DateTime64(3)}');
    queryParams.to = toChTs(params.to);
  }

  const where = conditions.join(' AND ');
  const result = await ch.query({
    query: `SELECT event_id, project_id, event_name, event_type, distinct_id, anonymous_id, user_id, person_id, ${RESOLVED_PERSON} AS resolved_person_id, session_id, url, referrer, page_title, page_path, device_type, browser, browser_version, os, os_version, screen_width, screen_height, country, region, city, language, timezone, properties, user_properties, sdk_name, sdk_version, timestamp, ingested_at, batch_id FROM events FINAL WHERE ${where} ORDER BY timestamp DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
    query_params: { ...queryParams, limit: params.limit, offset: params.offset },
    format: 'JSONEachRow',
  });

  return result.json<Event & { resolved_person_id: string }>();
}

export async function countEvents(
  ch: ClickHouseClient,
  params: {
    project_id: string;
    event_name?: string;
    from?: string;
    to?: string;
  },
) {
  const conditions = ['project_id = {project_id:UUID}'];
  const queryParams: Record<string, string> = { project_id: params.project_id };

  if (params.event_name) {
    conditions.push('event_name = {event_name:String}');
    queryParams.event_name = params.event_name;
  }
  if (params.from) {
    conditions.push('timestamp >= {from:DateTime64(3)}');
    queryParams.from = toChTs(params.from);
  }
  if (params.to) {
    conditions.push('timestamp <= {to:DateTime64(3)}');
    queryParams.to = toChTs(params.to);
  }

  const where = conditions.join(' AND ');
  const result = await ch.query({
    query: `SELECT count() AS count, uniq(${RESOLVED_PERSON}) AS unique_users, uniq(session_id) AS sessions FROM events FINAL WHERE ${where} AND event_type != 'identify'`,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ count: string; unique_users: string; sessions: string }>();
  return rows[0] || { count: '0', unique_users: '0', sessions: '0' };
}

export async function queryTrends(
  ch: ClickHouseClient,
  params: {
    project_id: string;
    event_name?: string;
    from: string;
    to: string;
    granularity: 'hour' | 'day' | 'week' | 'month';
  },
) {
  const truncFn: Record<string, string> = {
    hour: 'toStartOfHour',
    day: 'toStartOfDay',
    week: 'toStartOfWeek',
    month: 'toStartOfMonth',
  };
  const fn = truncFn[params.granularity];

  const conditions = [
    'project_id = {project_id:UUID}',
    'timestamp >= {from:DateTime64(3)}',
    'timestamp <= {to:DateTime64(3)}',
  ];
  const queryParams: Record<string, string> = {
    project_id: params.project_id,
    from: toChTs(params.from),
    to: toChTs(params.to),
  };

  if (params.event_name) {
    conditions.push('event_name = {event_name:String}');
    queryParams.event_name = params.event_name;
  }

  const where = conditions.join(' AND ');
  const result = await ch.query({
    query: `SELECT ${fn}(timestamp) AS period, count() AS count, uniq(${RESOLVED_PERSON}) AS unique_users FROM events FINAL WHERE ${where} AND event_type != 'identify' GROUP BY period ORDER BY period`,
    query_params: queryParams,
    format: 'JSONEachRow',
  });

  return result.json<{ period: string; count: string; unique_users: string }>();
}

export async function queryTopEvents(
  ch: ClickHouseClient,
  params: {
    project_id: string;
    from?: string;
    to?: string;
    limit: number;
  },
) {
  const conditions = ['project_id = {project_id:UUID}'];
  const queryParams: Record<string, string | number> = { project_id: params.project_id };

  if (params.from) {
    conditions.push('timestamp >= {from:DateTime64(3)}');
    queryParams.from = toChTs(params.from);
  }
  if (params.to) {
    conditions.push('timestamp <= {to:DateTime64(3)}');
    queryParams.to = toChTs(params.to);
  }

  const where = conditions.join(' AND ');
  const result = await ch.query({
    query: `SELECT event_name, count() AS count, uniq(${RESOLVED_PERSON}) AS unique_users FROM events FINAL WHERE ${where} AND event_type != 'identify' GROUP BY event_name ORDER BY count DESC LIMIT {limit:UInt32}`,
    query_params: { ...queryParams, limit: params.limit },
    format: 'JSONEachRow',
  });

  return result.json<{ event_name: string; count: string; unique_users: string }>();
}
