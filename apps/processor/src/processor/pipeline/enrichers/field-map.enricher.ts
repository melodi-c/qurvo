import type { Event } from '@qurvo/clickhouse';
import type { EventEnricher } from '../types';
import { safeScreenDimension } from '../../event-utils';

/**
 * Maps all remaining scalar DTO fields from the validated raw data onto the partial event.
 * Also emits a warning when the timestamp is missing (using current time as fallback).
 */
export const fieldMapEnricher: EventEnricher = async (data, event, ctx) => {
  if (!data.timestamp) {
    ctx.logger.warn(
      { projectId: data.project_id, distinctId: data.distinct_id },
      'Event missing timestamp, using current time',
    );
  }

  return {
    ...event,
    event_id: data.event_id || '',
    project_id: data.project_id,
    event_name: data.event_name,
    event_type: data.event_type || 'track',
    distinct_id: data.distinct_id,
    anonymous_id: data.anonymous_id,
    user_id: data.user_id,
    session_id: data.session_id,
    url: data.url,
    referrer: data.referrer,
    page_title: data.page_title,
    page_path: data.page_path,
    screen_width: safeScreenDimension(data.screen_width),
    screen_height: safeScreenDimension(data.screen_height),
    language: data.language,
    timezone: data.timezone,
    properties: data.properties,
    user_properties: data.user_properties,
    sdk_name: data.sdk_name,
    sdk_version: data.sdk_version,
    timestamp: data.timestamp || new Date().toISOString(),
    batch_id: data.batch_id,
  } satisfies Partial<Event>;
};
