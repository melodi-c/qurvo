import { describe, it, expect } from 'vitest';
import { parseUserProperties } from '../../processor/person-utils.js';

describe('parseUserProperties', () => {
  describe('$set handling', () => {
    it('parses $set object into setProps', () => {
      const raw = JSON.stringify({ $set: { plan: 'pro', company: 'Acme' } });
      const result = parseUserProperties(raw);

      expect(result.setProps).toEqual({ plan: 'pro', company: 'Acme' });
      expect(result.setOnceProps).toEqual({});
      expect(result.unsetKeys).toEqual([]);
    });

    it('treats root-level keys as implicit $set', () => {
      const raw = JSON.stringify({ plan: 'starter', age: 30 });
      const result = parseUserProperties(raw);

      expect(result.setProps).toMatchObject({ plan: 'starter', age: 30 });
    });

    it('merges explicit $set and root-level implicit $set into setProps', () => {
      const raw = JSON.stringify({ plan: 'free', $set: { role: 'admin' } });
      const result = parseUserProperties(raw);

      expect(result.setProps).toMatchObject({ plan: 'free', role: 'admin' });
    });

    it('root-level key overrides $set key with the same name (both merged)', () => {
      // Both end up in setProps — root-level runs after explicit $set merge
      const raw = JSON.stringify({ plan: 'override', $set: { plan: 'explicit' } });
      const result = parseUserProperties(raw);

      // Explicit $set is spread first, then root keys overwrite
      expect(result.setProps['plan']).toBe('override');
    });
  });

  describe('$set_once handling', () => {
    it('parses $set_once object into setOnceProps', () => {
      const raw = JSON.stringify({ $set_once: { signup_date: '2024-01-01' } });
      const result = parseUserProperties(raw);

      expect(result.setOnceProps).toEqual({ signup_date: '2024-01-01' });
    });

    it('does not include $set_once in setProps', () => {
      const raw = JSON.stringify({ $set_once: { original_plan: 'free' } });
      const result = parseUserProperties(raw);

      expect(result.setProps).not.toHaveProperty('original_plan');
      expect(result.setProps).not.toHaveProperty('$set_once');
    });
  });

  describe('$unset handling', () => {
    it('parses $unset array into unsetKeys', () => {
      const raw = JSON.stringify({ $unset: ['old_prop', 'another_prop'] });
      const result = parseUserProperties(raw);

      expect(result.unsetKeys).toEqual(['old_prop', 'another_prop']);
    });

    it('filters non-string values from $unset array', () => {
      const raw = JSON.stringify({ $unset: ['valid', 42, null, 'also_valid'] });
      const result = parseUserProperties(raw);

      expect(result.unsetKeys).toEqual(['valid', 'also_valid']);
    });

    it('treats non-array $unset as empty unsetKeys', () => {
      const raw = JSON.stringify({ $unset: 'not_an_array' });
      const result = parseUserProperties(raw);

      expect(result.unsetKeys).toEqual([]);
    });

    it('does not include $unset key in setProps', () => {
      const raw = JSON.stringify({ $unset: ['x'] });
      const result = parseUserProperties(raw);

      expect(result.setProps).not.toHaveProperty('$unset');
    });
  });

  describe('Noisy property filtering', () => {
    const noisyProps = [
      '$browser',
      '$browser_version',
      '$os',
      '$os_version',
      '$device_type',
      '$screen_width',
      '$screen_height',
      '$viewport_width',
      '$viewport_height',
      '$current_url',
      '$referrer',
      '$referring_domain',
      '$pathname',
      '$ip',
      '$geoip_country_code',
      '$geoip_city_name',
      '$timezone',
      '$language',
    ];

    it('filters all noisy properties from $set', () => {
      const setObj: Record<string, string> = {};
      for (const prop of noisyProps) {setObj[prop] = 'value';}
      const raw = JSON.stringify({ $set: { ...setObj, custom_prop: 'keep' } });
      const result = parseUserProperties(raw);

      for (const prop of noisyProps) {
        expect(result.setProps).not.toHaveProperty(prop);
      }
      expect(result.setProps['custom_prop']).toBe('keep');
    });

    it('filters all noisy properties from $set_once', () => {
      const setOnceObj: Record<string, string> = {};
      for (const prop of noisyProps) {setOnceObj[prop] = 'value';}
      const raw = JSON.stringify({ $set_once: { ...setOnceObj, first_seen: '2024-01-01' } });
      const result = parseUserProperties(raw);

      for (const prop of noisyProps) {
        expect(result.setOnceProps).not.toHaveProperty(prop);
      }
      expect(result.setOnceProps['first_seen']).toBe('2024-01-01');
    });

    it('filters noisy properties from root-level implicit $set', () => {
      const raw = JSON.stringify({
        $browser: 'Chrome',
        $os: 'Windows',
        plan: 'pro',
      });
      const result = parseUserProperties(raw);

      expect(result.setProps).not.toHaveProperty('$browser');
      expect(result.setProps).not.toHaveProperty('$os');
      expect(result.setProps['plan']).toBe('pro');
    });

    it('preserves custom non-noisy properties', () => {
      const raw = JSON.stringify({
        $set: { plan: 'enterprise', role: 'admin', $browser: 'Chrome' },
      });
      const result = parseUserProperties(raw);

      expect(result.setProps['plan']).toBe('enterprise');
      expect(result.setProps['role']).toBe('admin');
      expect(result.setProps).not.toHaveProperty('$browser');
    });
  });

  describe('Invalid JSON handling', () => {
    it('returns empty result for invalid JSON', () => {
      const result = parseUserProperties('{not valid json}');

      expect(result.setProps).toEqual({});
      expect(result.setOnceProps).toEqual({});
      expect(result.unsetKeys).toEqual([]);
    });

    it('returns empty result for empty string', () => {
      const result = parseUserProperties('');

      expect(result.setProps).toEqual({});
      expect(result.setOnceProps).toEqual({});
      expect(result.unsetKeys).toEqual([]);
    });

    it('returns empty result for bare JSON array', () => {
      // JSON.parse('[]') returns an array, not a Record — treated as invalid, fallback to {}
      // The function will try to read $set_once from [], which won't crash
      // since undefined ?? {} = {}. Actual arrays will iterate 0 entries.
      const result = parseUserProperties('[]');

      expect(result.setOnceProps).toEqual({});
      expect(result.unsetKeys).toEqual([]);
    });
  });

  describe('Reserved key exclusion from setProps', () => {
    it('does not include $set key itself in setProps', () => {
      const raw = JSON.stringify({ $set: { plan: 'pro' } });
      const result = parseUserProperties(raw);

      expect(result.setProps).not.toHaveProperty('$set');
    });

    it('does not include $set_once key itself in setProps', () => {
      const raw = JSON.stringify({ $set_once: { plan: 'free' } });
      const result = parseUserProperties(raw);

      expect(result.setProps).not.toHaveProperty('$set_once');
    });

    it('does not include $unset key itself in setProps', () => {
      const raw = JSON.stringify({ $unset: ['x'] });
      const result = parseUserProperties(raw);

      expect(result.setProps).not.toHaveProperty('$unset');
    });
  });

  describe('Combined operations', () => {
    it('correctly handles $set, $set_once, $unset, and root-level props together', () => {
      const raw = JSON.stringify({
        plan: 'starter',
        $set: { role: 'editor' },
        $set_once: { signup_date: '2024-01-01' },
        $unset: ['old_field'],
        $browser: 'Firefox',
      });
      const result = parseUserProperties(raw);

      expect(result.setProps['plan']).toBe('starter');
      expect(result.setProps['role']).toBe('editor');
      expect(result.setProps).not.toHaveProperty('$browser');
      expect(result.setOnceProps['signup_date']).toBe('2024-01-01');
      expect(result.unsetKeys).toContain('old_field');
    });

    it('handles empty object JSON', () => {
      const result = parseUserProperties('{}');

      expect(result.setProps).toEqual({});
      expect(result.setOnceProps).toEqual({});
      expect(result.unsetKeys).toEqual([]);
    });
  });
});
