import { describe, it, expect } from 'vitest';
import { resolveWindowSeconds } from '../../analytics/funnel/funnel-sql-shared';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

describe('resolveWindowSeconds', () => {
  describe('fallback — only conversion_window_days provided', () => {
    it('returns days * 86400 when neither value nor unit is present', () => {
      const result = resolveWindowSeconds({ conversion_window_days: 14 });
      expect(result).toBe(14 * 86400);
    });

    it('returns days * 86400 when value and unit are undefined', () => {
      const result = resolveWindowSeconds({
        conversion_window_days: 7,
        conversion_window_value: undefined,
        conversion_window_unit: undefined,
      });
      expect(result).toBe(7 * 86400);
    });
  });

  describe('both value and unit provided — returns correct seconds', () => {
    it('handles seconds unit', () => {
      expect(resolveWindowSeconds({ conversion_window_days: 14, conversion_window_value: 30, conversion_window_unit: 'second' })).toBe(30);
    });

    it('handles minutes unit', () => {
      expect(resolveWindowSeconds({ conversion_window_days: 14, conversion_window_value: 15, conversion_window_unit: 'minute' })).toBe(15 * 60);
    });

    it('handles hours unit', () => {
      expect(resolveWindowSeconds({ conversion_window_days: 14, conversion_window_value: 2, conversion_window_unit: 'hour' })).toBe(2 * 3600);
    });

    it('handles days unit', () => {
      expect(resolveWindowSeconds({ conversion_window_days: 14, conversion_window_value: 3, conversion_window_unit: 'day' })).toBe(3 * 86400);
    });

    it('handles weeks unit', () => {
      expect(resolveWindowSeconds({ conversion_window_days: 14, conversion_window_value: 2, conversion_window_unit: 'week' })).toBe(2 * 604800);
    });

    it('handles months unit', () => {
      expect(resolveWindowSeconds({ conversion_window_days: 14, conversion_window_value: 1, conversion_window_unit: 'month' })).toBe(2592000);
    });
  });

  describe('90-day limit enforcement — throws when resolved window exceeds 90 days', () => {
    const MAX_SECONDS = 90 * 86400; // 7_776_000

    it('throws when value=91, unit=day (91 days > 90 days)', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_value: 91,
          conversion_window_unit: 'day',
        }),
      ).toThrow(AppBadRequestException);
    });

    it('throws with descriptive message for oversized window', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_value: 91,
          conversion_window_unit: 'day',
        }),
      ).toThrow('exceeds the maximum allowed window of 90 days');
    });

    it('throws when value=999999, unit=day (the reported attack vector)', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_value: 999999,
          conversion_window_unit: 'day',
        }),
      ).toThrow(AppBadRequestException);
    });

    it('throws when value=13, unit=week (13 weeks = 91 days > 90)', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_value: 13,
          conversion_window_unit: 'week',
        }),
      ).toThrow(AppBadRequestException);
    });

    it('throws when value=4, unit=month (4 months = 120 days > 90)', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_value: 4,
          conversion_window_unit: 'month',
        }),
      ).toThrow(AppBadRequestException);
    });

    it('accepts exactly 90 days (value=90, unit=day)', () => {
      const result = resolveWindowSeconds({
        conversion_window_days: 14,
        conversion_window_value: 90,
        conversion_window_unit: 'day',
      });
      expect(result).toBe(MAX_SECONDS);
    });

    it('accepts value=12, unit=week (12 weeks = 84 days < 90)', () => {
      const result = resolveWindowSeconds({
        conversion_window_days: 14,
        conversion_window_value: 12,
        conversion_window_unit: 'week',
      });
      expect(result).toBe(12 * 604800);
    });

    it('accepts value=3, unit=month (3 months = 90 days = exactly 90)', () => {
      // 3 * 2_592_000 = 7_776_000 = 90 days
      const result = resolveWindowSeconds({
        conversion_window_days: 14,
        conversion_window_value: 3,
        conversion_window_unit: 'month',
      });
      expect(result).toBe(MAX_SECONDS);
    });

    it('accepts large value with small unit (value=86400, unit=second = 1 day)', () => {
      // 86400 seconds = exactly 1 day — well within limit
      const result = resolveWindowSeconds({
        conversion_window_days: 14,
        conversion_window_value: 86400,
        conversion_window_unit: 'second',
      });
      expect(result).toBe(86400);
    });
  });

  describe('partial pair — throws AppBadRequestException', () => {
    it('throws when conversion_window_unit is provided without conversion_window_value', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_unit: 'hour',
        }),
      ).toThrow(AppBadRequestException);
    });

    it('throws with descriptive message when unit is provided without value', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_unit: 'hour',
        }),
      ).toThrow('conversion_window_unit requires conversion_window_value to be specified');
    });

    it('throws when conversion_window_value is provided without conversion_window_unit', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_value: 5,
        }),
      ).toThrow(AppBadRequestException);
    });

    it('throws with descriptive message when value is provided without unit', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_value: 5,
        }),
      ).toThrow('conversion_window_value requires conversion_window_unit to be specified');
    });

    it('throws when unit is provided and value is explicitly null', () => {
      expect(() =>
        resolveWindowSeconds({
          conversion_window_days: 14,
          conversion_window_value: undefined,
          conversion_window_unit: 'day',
        }),
      ).toThrow(AppBadRequestException);
    });
  });
});
