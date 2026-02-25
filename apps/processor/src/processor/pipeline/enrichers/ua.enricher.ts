import type { Event } from '@qurvo/clickhouse';
import type { EventEnricher } from '../types';
import { parseUa } from '../../event-utils';

/**
 * Parses the raw user_agent string into structured UA fields (browser, OS, device_type).
 * SDK context fields already present in data.* take precedence over the parsed values —
 * UA parsing is the fallback for when the SDK does not provide structured device info.
 */
export const uaEnricher: EventEnricher = async (data, event, _ctx) => {
  const ua = parseUa(data.user_agent);
  return {
    ...event,
    device_type: data.device_type || ua.device_type,
    browser: data.browser || ua.browser,
    browser_version: data.browser_version || ua.browser_version,
    os: data.os || ua.os,
    os_version: data.os_version || ua.os_version,
  } satisfies Partial<Event>;
};
