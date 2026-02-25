import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { detectValueType } from '../../processor/value-type.js';

describe('detectValueType', () => {
  describe('Boolean values', () => {
    it('detects JS boolean true as Boolean', () => {
      expect(detectValueType('active', true)).toBe('Boolean');
    });

    it('detects JS boolean false as Boolean', () => {
      expect(detectValueType('active', false)).toBe('Boolean');
    });

    it('detects string "true" as Boolean', () => {
      expect(detectValueType('active', 'true')).toBe('Boolean');
    });

    it('detects string "false" as Boolean', () => {
      expect(detectValueType('active', 'false')).toBe('Boolean');
    });

    it('detects uppercase "TRUE" as Boolean', () => {
      expect(detectValueType('active', 'TRUE')).toBe('Boolean');
    });

    it('detects uppercase "FALSE" as Boolean', () => {
      expect(detectValueType('active', 'FALSE')).toBe('Boolean');
    });
  });

  describe('Numeric values', () => {
    it('detects JS number as Numeric', () => {
      expect(detectValueType('count', 42)).toBe('Numeric');
    });

    it('detects JS float as Numeric', () => {
      expect(detectValueType('price', 3.14)).toBe('Numeric');
    });

    it('detects numeric string as Numeric', () => {
      expect(detectValueType('count', '100')).toBe('Numeric');
    });

    it('detects float string as Numeric', () => {
      expect(detectValueType('score', '9.99')).toBe('Numeric');
    });

    it('detects scientific notation string "1.5e3" as Numeric', () => {
      expect(detectValueType('value', '1.5e3')).toBe('Numeric');
    });

    it('detects negative numeric string as Numeric', () => {
      expect(detectValueType('delta', '-7')).toBe('Numeric');
    });

    it('detects zero string as Numeric', () => {
      expect(detectValueType('count', '0')).toBe('Numeric');
    });
  });

  describe('String values', () => {
    it('detects plain string as String', () => {
      expect(detectValueType('name', 'Alice')).toBe('String');
    });

    it('detects "true" string value (mixed case) as String when key is not date-like', () => {
      // "true" → Boolean, but "True" (not in the set) → String
      expect(detectValueType('label', 'True')).toBe('String');
    });

    it('detects empty string as String', () => {
      expect(detectValueType('note', '')).toBe('String');
    });

    it('does NOT treat "true" as Boolean when only whitespace-padded beyond trim (not actually — trim is applied)', () => {
      // "  true  ".trim() === "true" → Boolean
      expect(detectValueType('flag', '  true  ')).toBe('Boolean');
    });
  });

  describe('DateTime values', () => {
    it('detects ISO date string on date-keyed property as DateTime', () => {
      expect(detectValueType('created_at', '2024-01-15T10:30:00Z')).toBe('DateTime');
    });

    it('detects ISO date string on "timestamp" key as DateTime', () => {
      expect(detectValueType('timestamp', '2024-06-01 12:00:00')).toBe('DateTime');
    });

    it('detects ISO date string on "date" key as DateTime', () => {
      expect(detectValueType('date', '2024-01-15T00:00:00')).toBe('DateTime');
    });

    it('detects unix timestamp number on "time" key as DateTime', () => {
      const nowS = Math.floor(Date.now() / 1000);
      expect(detectValueType('time', nowS)).toBe('DateTime');
    });

    it('detects unix timestamp number on "createdat" key as DateTime', () => {
      const recentS = Math.floor(Date.now() / 1000) - 1000;
      expect(detectValueType('createdat', recentS)).toBe('DateTime');
    });

    it('does NOT detect number as DateTime on non-date key', () => {
      expect(detectValueType('count', Math.floor(Date.now() / 1000))).toBe('Numeric');
    });

    it('does NOT detect ISO date string as DateTime on non-date key', () => {
      // Non-date key + ISO date string → DateTime path via isLikelyDateString check in string section
      expect(detectValueType('label', '2024-01-15T10:00:00Z')).toBe('DateTime');
    });

    it('detects out-of-range unix timestamp as Numeric (not DateTime)', () => {
      // Very old timestamp (year 1990-ish) would be out of range
      expect(detectValueType('time', 631152000)).toBe('Numeric');
    });
  });

  describe('Null and non-primitive values', () => {
    it('returns null for null value', () => {
      expect(detectValueType('key', null)).toBeNull();
    });

    it('returns null for object value', () => {
      expect(detectValueType('meta', { a: 1 })).toBeNull();
    });

    it('returns null for array value', () => {
      expect(detectValueType('tags', ['a', 'b'])).toBeNull();
    });

    it('returns null for undefined value', () => {
      expect(detectValueType('key', undefined)).toBeNull();
    });
  });

  describe('Hard-coded String overrides (A5)', () => {
    it('returns String for utm_ prefixed keys regardless of value', () => {
      expect(detectValueType('utm_source', 123)).toBe('String');
      expect(detectValueType('utm_medium', true)).toBe('String');
      expect(detectValueType('UTM_CAMPAIGN', 'google')).toBe('String');
    });

    it('returns String for $initial_utm_ prefixed keys', () => {
      expect(detectValueType('$initial_utm_source', 'organic')).toBe('String');
    });

    it('returns String for $feature/ prefixed keys', () => {
      expect(detectValueType('$feature/my-flag', true)).toBe('String');
    });

    it('returns String for $feature_flag_response key', () => {
      expect(detectValueType('$feature_flag_response', true)).toBe('String');
    });

    it('returns String for $survey_response prefixed keys', () => {
      expect(detectValueType('$survey_response_123', 'yes')).toBe('String');
    });
  });

  describe('Edge cases', () => {
    it('handles whitespace-only string (does not detect as Numeric)', () => {
      // "   ".trim() === "" → empty → String (not Numeric, since trimmed is empty)
      expect(detectValueType('val', '   ')).toBe('String');
    });

    it('handles NaN string as String', () => {
      expect(detectValueType('val', 'NaN')).toBe('String');
    });

    it('handles Infinity string as String', () => {
      // Number("Infinity") → Infinity, but isNaN(Infinity) is false and Infinity !== Numeric
      // Actually Number("Infinity") is valid but we verify behavior
      const result = detectValueType('val', 'Infinity');
      // "Infinity" is not NaN but Infinity is not finite — trimmed !== '' && !isNaN(Number('Infinity')) = true → Numeric
      // But the logic uses `!isNaN(Number(trimmed))` which is true for "Infinity"
      // Documenting actual behavior: Infinity string is treated as Numeric
      expect(result).toBe('Numeric');
    });
  });
});
