import { describe, it, expect } from 'vitest';
import {
  toChTs,
  granularityTruncExpr,
  shiftPeriod,
  shiftDate,
  truncateDate,
  granularityInterval,
  tsExpr,
} from '../../utils/clickhouse-helpers';

describe('toChTs', () => {
  it('returns midnight local datetime string when only date part is given', () => {
    expect(toChTs('2024-01-10')).toBe('2024-01-10 00:00:00');
  });

  it('appends 23:59:59 when date-only and endOfDay=true', () => {
    expect(toChTs('2024-01-10', true)).toBe('2024-01-10 23:59:59');
  });

  it('converts UTC ISO datetime with Z suffix', () => {
    expect(toChTs('2024-01-10T12:00:00Z')).toBe('2024-01-10 12:00:00');
  });

  it('converts ISO datetime without timezone (treated as UTC)', () => {
    expect(toChTs('2024-01-10T12:00:00')).toBe('2024-01-10 12:00:00');
  });

  it('strips milliseconds from ISO datetime with Z', () => {
    expect(toChTs('2024-01-10T12:00:00.123Z')).toBe('2024-01-10 12:00:00');
  });

  it('converts ISO datetime with positive timezone offset (+03:00) to UTC', () => {
    expect(toChTs('2024-01-10T12:00:00+03:00')).toBe('2024-01-10 09:00:00');
  });

  it('converts ISO datetime with negative timezone offset (-05:00) to UTC', () => {
    expect(toChTs('2024-01-10T12:00:00-05:00')).toBe('2024-01-10 17:00:00');
  });

  it('converts ISO datetime with milliseconds and positive timezone offset', () => {
    expect(toChTs('2024-01-10T12:30:45.999+03:00')).toBe('2024-01-10 09:30:45');
  });

  it('converts ISO datetime with milliseconds and negative timezone offset', () => {
    expect(toChTs('2024-01-10T00:00:00.000-05:30')).toBe('2024-01-10 05:30:00');
  });

  it('handles midnight UTC correctly', () => {
    expect(toChTs('2024-01-10T00:00:00Z')).toBe('2024-01-10 00:00:00');
  });

  it('handles date rollover when offset shifts to previous day', () => {
    expect(toChTs('2024-01-10T01:00:00+03:00')).toBe('2024-01-09 22:00:00');
  });
});

describe('granularityTruncExpr', () => {
  it('generates toStartOfHour for hour granularity', () => {
    expect(granularityTruncExpr('hour', 'timestamp')).toBe('toStartOfHour(timestamp)');
  });

  it('generates toStartOfDay for day granularity', () => {
    expect(granularityTruncExpr('day', 'timestamp')).toBe('toStartOfDay(timestamp)');
  });

  it('generates toDateTime(toStartOfWeek) for week granularity', () => {
    expect(granularityTruncExpr('week', 'timestamp')).toBe('toDateTime(toStartOfWeek(timestamp, 1))');
  });

  it('generates toDateTime(toStartOfMonth) for month granularity', () => {
    expect(granularityTruncExpr('month', 'timestamp')).toBe('toDateTime(toStartOfMonth(timestamp))');
  });

  it('works with custom column name', () => {
    expect(granularityTruncExpr('day', 'event_time')).toBe('toStartOfDay(event_time)');
    expect(granularityTruncExpr('hour', 'e.ts')).toBe('toStartOfHour(e.ts)');
  });

  it('throws for unknown granularity', () => {
    expect(() => granularityTruncExpr('year' as never, 'ts')).toThrow('Unhandled granularity: year');
  });

  describe('with timezone', () => {
    it('includes timezone in toStartOfHour for hour granularity', () => {
      expect(granularityTruncExpr('hour', 'timestamp', 'Europe/Moscow')).toBe(
        "toStartOfHour(timestamp, 'Europe/Moscow')",
      );
    });

    it('includes timezone in toStartOfDay for day granularity', () => {
      expect(granularityTruncExpr('day', 'timestamp', 'America/New_York')).toBe(
        "toStartOfDay(timestamp, 'America/New_York')",
      );
    });

    it('includes timezone in toStartOfWeek for week granularity', () => {
      expect(granularityTruncExpr('week', 'timestamp', 'Europe/Moscow')).toBe(
        "toDateTime(toStartOfWeek(timestamp, 1, 'Europe/Moscow'), 'Europe/Moscow')",
      );
    });

    it('includes timezone in toStartOfMonth for month granularity', () => {
      expect(granularityTruncExpr('month', 'timestamp', 'Asia/Tokyo')).toBe(
        "toDateTime(toStartOfMonth(timestamp, 'Asia/Tokyo'), 'Asia/Tokyo')",
      );
    });

    it('behaves same as no timezone when tz is UTC', () => {
      expect(granularityTruncExpr('day', 'timestamp', 'UTC')).toBe('toStartOfDay(timestamp)');
      expect(granularityTruncExpr('week', 'timestamp', 'UTC')).toBe('toDateTime(toStartOfWeek(timestamp, 1))');
    });
  });
});

describe('tsExpr', () => {
  it('returns DateTime64 param expression when hasTz is false', () => {
    expect(tsExpr('from', 'tz', false)).toBe('{from:DateTime64(3)}');
  });

  it('returns toDateTime64 String expression when hasTz is true', () => {
    expect(tsExpr('from', 'tz', true)).toBe('toDateTime64({from:String}, 3, {tz:String})');
  });

  it('uses provided param and tz names', () => {
    expect(tsExpr('extended_from', 'tz', true)).toBe('toDateTime64({extended_from:String}, 3, {tz:String})');
    expect(tsExpr('to', 'timezone_param', false)).toBe('{to:DateTime64(3)}');
  });
});

describe('shiftPeriod', () => {
  it('computes previous period of equal length', () => {
    // 2024-01-01 to 2024-01-07 is 7 days; previous period should be 7 days back
    const result = shiftPeriod('2024-01-08', '2024-01-14');
    expect(result.from).toBe('2024-01-01');
    expect(result.to).toBe('2024-01-07');
  });

  it('handles single-day period', () => {
    // 2024-03-15 to 2024-03-15: 1 day
    const result = shiftPeriod('2024-03-15', '2024-03-15');
    expect(result.from).toBe('2024-03-14');
    expect(result.to).toBe('2024-03-14');
  });

  it('returns from < to', () => {
    const result = shiftPeriod('2024-06-01', '2024-06-30');
    const from = new Date(result.from);
    const to = new Date(result.to);
    expect(from.getTime()).toBeLessThan(to.getTime());
  });

  it('returns 10-character date strings', () => {
    const result = shiftPeriod('2024-01-01', '2024-01-31');
    expect(result.from).toHaveLength(10);
    expect(result.to).toHaveLength(10);
    expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('previous period ends right before the current period starts', () => {
    // 2024-02-01 to 2024-02-29 (29 days leap year)
    const result = shiftPeriod('2024-02-01', '2024-02-29');
    // previous to should be 2024-01-31 (one day before 2024-02-01)
    expect(result.to).toBe('2024-01-31');
  });

  it('no gap or overlap at week granularity boundary', () => {
    // Weekly period: Mon 2024-01-08 to Sun 2024-01-14
    const result = shiftPeriod('2024-01-08', '2024-01-14');
    // Current period: Jan 8–14 (Mon–Sun), previous should be Jan 1–7 (Mon–Sun)
    // prevTo = Jan 7 (the day before Jan 8) — stays inside the same week, no extra bucket
    expect(result.from).toBe('2024-01-01');
    expect(result.to).toBe('2024-01-07');
    // Verify no gap: prevTo + 1 day == dateFrom
    const prevToDate = new Date(`${result.to}T00:00:00Z`);
    const dateFromDate = new Date('2024-01-08T00:00:00Z');
    expect(prevToDate.getTime() + 86400000).toBe(dateFromDate.getTime());
  });

  it('no gap or overlap at month granularity boundary', () => {
    // Monthly period: 2024-02-01 to 2024-02-29 (leap year, 29 days)
    const result = shiftPeriod('2024-02-01', '2024-02-29');
    // Previous 29-day period ends on 2024-01-31 and starts on 2024-01-03
    expect(result.to).toBe('2024-01-31');
    expect(result.from).toBe('2024-01-03');
    // Verify no gap: prevTo + 1 day == dateFrom
    const prevToDate = new Date(`${result.to}T00:00:00Z`);
    const dateFromDate = new Date('2024-02-01T00:00:00Z');
    expect(prevToDate.getTime() + 86400000).toBe(dateFromDate.getTime());
  });

  it('previous period has same length as current period (no duplicate days)', () => {
    // 7-day period
    const result = shiftPeriod('2024-03-04', '2024-03-10');
    const prevFrom = new Date(`${result.from}T00:00:00Z`);
    const prevTo = new Date(`${result.to}T00:00:00Z`);
    const prevDays = Math.round((prevTo.getTime() - prevFrom.getTime()) / 86400000) + 1;
    expect(prevDays).toBe(7);
  });

  it('handles week boundary where prevTo is Sunday (not Saturday)', () => {
    // If dateFrom is a Monday, prevTo must be Sunday (not Saturday)
    // Week: Mon 2024-01-15 to Sun 2024-01-21
    const result = shiftPeriod('2024-01-15', '2024-01-21');
    expect(result.to).toBe('2024-01-14'); // Sunday
    expect(result.from).toBe('2024-01-08'); // Monday
    // Sunday 2024-01-14: day=0 via getUTCDay()
    const prevToDay = new Date(`${result.to}T00:00:00Z`).getUTCDay();
    expect(prevToDay).toBe(0); // 0 = Sunday
  });
});

describe('shiftDate', () => {
  it('shifts date forward by days', () => {
    expect(shiftDate('2024-01-01', 5, 'day')).toBe('2024-01-06');
  });

  it('shifts date backward by days (negative periods)', () => {
    expect(shiftDate('2024-01-10', -3, 'day')).toBe('2024-01-07');
  });

  it('shifts date forward by weeks', () => {
    expect(shiftDate('2024-01-01', 2, 'week')).toBe('2024-01-15');
  });

  it('shifts date backward by weeks', () => {
    expect(shiftDate('2024-01-15', -1, 'week')).toBe('2024-01-08');
  });

  it('shifts date forward by months', () => {
    // JavaScript Date.setUTCMonth overflows: Jan 31 + 1 month → Feb 31 → Mar 2
    expect(shiftDate('2024-01-31', 1, 'month')).toBe('2024-03-02');
    // Safe case: shift from the 1st of a month
    expect(shiftDate('2024-01-01', 1, 'month')).toBe('2024-02-01');
  });

  it('shifts date backward by months', () => {
    expect(shiftDate('2024-03-01', -1, 'month')).toBe('2024-02-01');
  });

  it('shifts by 0 returns same date', () => {
    expect(shiftDate('2024-06-15', 0, 'day')).toBe('2024-06-15');
    expect(shiftDate('2024-06-15', 0, 'week')).toBe('2024-06-15');
    expect(shiftDate('2024-06-15', 0, 'month')).toBe('2024-06-15');
  });

  it('handles month boundary crossing (day granularity)', () => {
    expect(shiftDate('2024-01-30', 3, 'day')).toBe('2024-02-02');
  });

  it('returns 10-character YYYY-MM-DD string', () => {
    const result = shiftDate('2024-01-01', 1, 'day');
    expect(result).toHaveLength(10);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('truncateDate', () => {
  it('returns same date for day granularity', () => {
    expect(truncateDate('2024-03-15', 'day')).toBe('2024-03-15');
  });

  it('truncates to Monday for week granularity (Monday input)', () => {
    // 2024-01-01 is a Monday
    expect(truncateDate('2024-01-01', 'week')).toBe('2024-01-01');
  });

  it('truncates to Monday for week granularity (mid-week input)', () => {
    // 2024-01-03 is a Wednesday → Monday was 2024-01-01
    expect(truncateDate('2024-01-03', 'week')).toBe('2024-01-01');
  });

  it('truncates to Monday for week granularity (Sunday input)', () => {
    // 2024-01-07 is a Sunday → Monday was 2024-01-01
    expect(truncateDate('2024-01-07', 'week')).toBe('2024-01-01');
  });

  it('truncates to first of month for month granularity', () => {
    expect(truncateDate('2024-03-15', 'month')).toBe('2024-03-01');
  });

  it('returns first of month unchanged for month granularity', () => {
    expect(truncateDate('2024-01-01', 'month')).toBe('2024-01-01');
  });

  it('truncates last day of month to first for month granularity', () => {
    expect(truncateDate('2024-01-31', 'month')).toBe('2024-01-01');
  });

  it('returns 10-character YYYY-MM-DD string', () => {
    const result = truncateDate('2024-06-15', 'month');
    expect(result).toHaveLength(10);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('granularityInterval', () => {
  it('returns INTERVAL 1 DAY for day', () => {
    expect(granularityInterval('day')).toBe('INTERVAL 1 DAY');
  });

  it('returns INTERVAL 7 DAY for week', () => {
    expect(granularityInterval('week')).toBe('INTERVAL 7 DAY');
  });

  it('returns INTERVAL 1 MONTH for month', () => {
    expect(granularityInterval('month')).toBe('INTERVAL 1 MONTH');
  });

  it('throws for unknown granularity', () => {
    expect(() => granularityInterval('year' as never)).toThrow('Unhandled granularity: year');
  });
});
