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
