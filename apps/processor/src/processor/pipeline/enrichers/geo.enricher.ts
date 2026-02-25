import type { Event } from '@qurvo/clickhouse';
import type { EventEnricher } from '../types';

/**
 * Looks up the country for the event's IP address using the GeoIP service.
 * Also normalises the ip field on the partial event.
 */
export const geoEnricher: EventEnricher = async (data, event, ctx) => {
  const ip = data.ip || '';
  const country = ctx.geoService.lookupCountry(ip);
  return { ...event, ip, country } satisfies Partial<Event>;
};
