import { describe, it, expect } from 'vitest';
import {
  granularityTruncExpr,
  shiftPeriod,
  shiftDate,
  truncateDate,
  granularityInterval,
} from '../../utils/clickhouse-helpers';

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
