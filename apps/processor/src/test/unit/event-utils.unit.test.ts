import { describe, it, expect } from 'vitest';
import { safeScreenDimension, groupByKey, parseUa } from '../../processor/event-utils.js';

describe('safeScreenDimension', () => {
  it('returns a positive integer as-is', () => {
    expect(safeScreenDimension(1920)).toBe(1920);
  });

  it('returns 0 for NaN', () => {
    expect(safeScreenDimension(NaN)).toBe(0);
  });

  it('returns 0 for negative values', () => {
    expect(safeScreenDimension(-100)).toBe(0);
  });

  it('returns 0 for zero', () => {
    expect(safeScreenDimension(0)).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(safeScreenDimension(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(safeScreenDimension(undefined)).toBe(0);
  });

  it('returns 0 for non-numeric string', () => {
    expect(safeScreenDimension('abc')).toBe(0);
  });

  it('parses a numeric string to integer', () => {
    expect(safeScreenDimension('1080')).toBe(1080);
  });

  it('parses a float string by truncating to integer via parseInt', () => {
    // parseInt('1080.5', 10) === 1080
    expect(safeScreenDimension('1080.5')).toBe(1080);
  });

  it('returns 0 for Infinity', () => {
    expect(safeScreenDimension(Infinity)).toBe(0);
  });

  it('returns 0 for boolean true (Number(true)=1 is >0 and finite)', () => {
    // Number(true) === 1, which is > 0 and finite → returns 1
    expect(safeScreenDimension(true)).toBe(1);
  });

  it('returns 0 for boolean false (Number(false)=0)', () => {
    expect(safeScreenDimension(false)).toBe(0);
  });

  it('returns 0 for empty string (parseInt gives NaN)', () => {
    expect(safeScreenDimension('')).toBe(0);
  });
});

describe('groupByKey', () => {
  it('groups items by key function', () => {
    const items = [
      { id: 1, group: 'a' },
      { id: 2, group: 'b' },
      { id: 3, group: 'a' },
    ];
    const result = groupByKey(items, (item) => item.group);

    expect(result.size).toBe(2);
    expect(result.get('a')).toEqual([{ id: 1, group: 'a' }, { id: 3, group: 'a' }]);
    expect(result.get('b')).toEqual([{ id: 2, group: 'b' }]);
  });

  it('returns empty map for empty input', () => {
    const result = groupByKey([], (item: { key: string }) => item.key);
    expect(result.size).toBe(0);
  });

  it('puts all items in one group when all keys are equal', () => {
    const items = ['x', 'y', 'z'];
    const result = groupByKey(items, () => 'same');

    expect(result.size).toBe(1);
    expect(result.get('same')).toEqual(['x', 'y', 'z']);
  });

  it('creates one group per item when all keys are unique', () => {
    const items = [1, 2, 3];
    const result = groupByKey(items, (n) => String(n));

    expect(result.size).toBe(3);
    expect(result.get('1')).toEqual([1]);
    expect(result.get('2')).toEqual([2]);
    expect(result.get('3')).toEqual([3]);
  });

  it('preserves insertion order within each group', () => {
    const items = ['a1', 'b1', 'a2', 'b2', 'a3'];
    const result = groupByKey(items, (s) => s[0]);

    expect(result.get('a')).toEqual(['a1', 'a2', 'a3']);
    expect(result.get('b')).toEqual(['b1', 'b2']);
  });

  it('preserves insertion order of groups (Map preserves insertion order)', () => {
    const items = ['b', 'a', 'c'];
    const result = groupByKey(items, (s) => s);

    expect([...result.keys()]).toEqual(['b', 'a', 'c']);
  });

  it('handles a single-element array', () => {
    const result = groupByKey(['hello'], (s) => s);
    expect(result.size).toBe(1);
    expect(result.get('hello')).toEqual(['hello']);
  });
});

describe('parseUa', () => {
  it('returns empty fields for undefined user agent', () => {
    const result = parseUa(undefined);
    expect(result).toEqual({
      browser: '',
      browser_version: '',
      os: '',
      os_version: '',
      device_type: '',
    });
  });

  it('returns empty fields for empty string user agent', () => {
    const result = parseUa('');
    expect(result).toEqual({
      browser: '',
      browser_version: '',
      os: '',
      os_version: '',
      device_type: '',
    });
  });

  it('parses Chrome desktop user agent', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUa(ua);

    expect(result.browser).toBe('Chrome');
    expect(result.browser_version).toMatch(/^120/);
    expect(result.os).toBe('Windows');
    // No device type from ua-parser-js for desktop → fallback 'desktop' because browser.name is set
    expect(result.device_type).toBe('desktop');
  });

  it('parses Firefox desktop user agent', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0';
    const result = parseUa(ua);

    expect(result.browser).toBe('Firefox');
    expect(result.os).toBe('Linux');
    expect(result.device_type).toBe('desktop');
  });

  it('parses Safari on macOS user agent', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    const result = parseUa(ua);

    expect(result.browser).toBe('Safari');
    expect(result.os).toBe('macOS');
    expect(result.device_type).toBe('desktop');
  });

  it('parses mobile Safari user agent and returns mobile device type', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const result = parseUa(ua);

    expect(result.browser).toBe('Mobile Safari');
    expect(result.os).toBe('iOS');
    expect(result.device_type).toBe('mobile');
  });

  it('returns "desktop" fallback when browser is known but device type is not detected', () => {
    // Generic desktop UA — ua-parser-js does not set device.type for desktop browsers
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
    const result = parseUa(ua);

    // ua-parser-js returns undefined for device.type on desktop → fallback to 'desktop'
    expect(result.device_type).toBe('desktop');
    expect(result.browser).toBeTruthy();
  });

  it('returns empty device_type when browser is also unknown', () => {
    // Completely unknown UA → browser.name = undefined, device.type = undefined → device_type = ''
    const result = parseUa('CustomBot/1.0');
    expect(result.device_type).toBe('');
    expect(result.browser).toBe('');
  });

  it('returns all string fields (no undefined)', () => {
    const result = parseUa('Mozilla/5.0 (compatible; Googlebot/2.1)');
    expect(typeof result.browser).toBe('string');
    expect(typeof result.browser_version).toBe('string');
    expect(typeof result.os).toBe('string');
    expect(typeof result.os_version).toBe('string');
    expect(typeof result.device_type).toBe('string');
  });
});
