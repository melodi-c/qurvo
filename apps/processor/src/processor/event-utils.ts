import { UAParser } from 'ua-parser-js';

/** Safely parse a screen dimension value (width/height) to a non-negative integer. */
export function safeScreenDimension(value: unknown): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Group items by a string key, preserving insertion order within each group. */
export function groupByKey<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export interface ParsedUa {
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  device_type: string;
}

const EMPTY_UA: ParsedUa = Object.freeze({ browser: '', browser_version: '', os: '', os_version: '', device_type: '' });

/** Parse User-Agent string into structured UA fields. Returns empty fields if UA is missing. */
export function parseUa(userAgent?: string): ParsedUa {
  if (!userAgent) return EMPTY_UA;
  const result = new UAParser(userAgent).getResult();
  return {
    browser: result.browser.name ?? '',
    browser_version: result.browser.version ?? '',
    os: result.os.name ?? '',
    os_version: result.os.version ?? '',
    device_type: result.device.type ?? 'desktop',
  };
}
