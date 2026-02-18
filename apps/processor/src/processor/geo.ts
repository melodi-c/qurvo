import * as geoip from 'geoip-lite';

const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);

export function lookupGeo(ip: string): { country: string; region: string; city: string } {
  if (!ip || LOOPBACK.has(ip)) {
    return { country: '', region: '', city: '' };
  }
  const geo = geoip.lookup(ip);
  return {
    country: geo?.country ?? '',
    region: geo?.region ?? '',
    city: geo?.city ?? '',
  };
}
