import type { PinoLogger } from 'nestjs-pino';
import type { Event } from '@qurvo/clickhouse';
import type { ValidMessage, BufferedEvent, ResolveResult, ValidatedFields } from './types';
import type { PersonResolverService } from '../person-resolver.service';
import type { PersonBatchStore } from '../person-batch-store';
import type { GeoService } from '../geo.service';
import { safeScreenDimension, groupByKey, parseUa } from '../event-utils';

/**
 * Step 4: Resolve persons and build Event DTOs.
 * Concurrent across distinct IDs, serial within.
 * Uses allSettled so one failing group doesn't block others —
 * failed groups' messages stay in PEL for XAUTOCLAIM re-delivery.
 */
export async function resolveAndBuildEvents(
  valid: ValidMessage[],
  personCache: Map<string, string>,
  deps: {
    personResolver: PersonResolverService;
    personBatchStore: PersonBatchStore;
    geoService: GeoService;
    logger: PinoLogger;
  },
): Promise<ResolveResult> {
  const groups = groupByKey(valid, (item) =>
    `${item.fields.project_id}:${item.fields.distinct_id}`,
  );

  const groupEntries = Array.from(groups.values());
  const settled = await Promise.allSettled(
    groupEntries.map(async (group) => {
      const results: BufferedEvent[] = [];
      for (const item of group) {
        results.push({
          messageId: item.id,
          event: await buildEvent(item.fields, personCache, deps),
        });
      }
      return results;
    }),
  );

  const buffered: BufferedEvent[] = [];
  const failedIds: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      buffered.push(...result.value);
    } else {
      const group = groupEntries[i];
      failedIds.push(...group.map((item) => item.id));
      deps.logger.error(
        { err: result.reason, groupSize: group.length, distinctId: group[0].fields.distinct_id },
        'Group processing failed — messages stay in PEL for re-delivery',
      );
    }
  }

  return { buffered, failedIds };
}

async function buildEvent(
  data: ValidatedFields,
  personCache: Map<string, string>,
  deps: {
    personResolver: PersonResolverService;
    personBatchStore: PersonBatchStore;
    geoService: GeoService;
    logger: PinoLogger;
  },
): Promise<Event> {
  const ip = data.ip || '';
  const country = deps.geoService.lookupCountry(ip);

  let personId: string;
  let mergedFromPersonId: string | null = null;

  if (data.event_name === '$identify' && data.anonymous_id) {
    const result = await deps.personResolver.handleIdentify(data.project_id, data.distinct_id, data.anonymous_id, personCache);
    personId = result.personId;
    mergedFromPersonId = result.mergedFromPersonId;
  } else {
    personId = await deps.personResolver.resolve(data.project_id, data.distinct_id, personCache);
  }

  deps.personBatchStore.enqueue(data.project_id, personId, data.distinct_id, data.user_properties || '{}');
  if (mergedFromPersonId) {
    deps.personBatchStore.enqueueMerge(data.project_id, mergedFromPersonId, personId);
  }

  if (!data.timestamp) {
    deps.logger.warn({ projectId: data.project_id, distinctId: data.distinct_id }, 'Event missing timestamp, using current time');
  }

  // Parse UA from raw user_agent string; SDK context fields (already in data.*) take precedence
  const ua = parseUa(data.user_agent);

  return {
    event_id: data.event_id || '',
    project_id: data.project_id,
    event_name: data.event_name,
    event_type: data.event_type || 'track',
    distinct_id: data.distinct_id,
    anonymous_id: data.anonymous_id,
    user_id: data.user_id,
    person_id: personId,
    session_id: data.session_id,
    url: data.url,
    referrer: data.referrer,
    page_title: data.page_title,
    page_path: data.page_path,
    device_type: data.device_type || ua.device_type,
    browser: data.browser || ua.browser,
    browser_version: data.browser_version || ua.browser_version,
    os: data.os || ua.os,
    os_version: data.os_version || ua.os_version,
    screen_width: safeScreenDimension(data.screen_width),
    screen_height: safeScreenDimension(data.screen_height),
    country,
    language: data.language,
    timezone: data.timezone,
    properties: data.properties,
    user_properties: data.user_properties,
    sdk_name: data.sdk_name,
    sdk_version: data.sdk_version,
    timestamp: data.timestamp || new Date().toISOString(),
    batch_id: data.batch_id,
    ip,
  };
}
