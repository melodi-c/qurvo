import { describe, it, expect } from 'vitest';
import {
  toChTs,
  shiftPeriod,
  shiftDate,
  truncateDate,
} from '../../analytics/query-helpers';

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

  it('shifts hours forward', () => {
    expect(shiftDate('2024-01-15 10:00:00', 3, 'hour')).toBe('2024-01-15 13:00:00');
  });

  it('shifts hours backward', () => {
    expect(shiftDate('2024-01-15 10:00:00', -5, 'hour')).toBe('2024-01-15 05:00:00');
  });

  it('shifts hours across day boundary', () => {
    expect(shiftDate('2024-01-15 22:00:00', 5, 'hour')).toBe('2024-01-16 03:00:00');
  });

  it('returns YYYY-MM-DD HH:mm:ss string for hour granularity', () => {
    const result = shiftDate('2024-01-15 10:00:00', 1, 'hour');
    expect(result).toHaveLength(19);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
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

  it('truncates to start of hour (zeroes minutes and seconds)', () => {
    expect(truncateDate('2024-03-15 14:35:42', 'hour')).toBe('2024-03-15 14:00:00');
  });

  it('hour truncation on already-truncated datetime is identity', () => {
    expect(truncateDate('2024-03-15 10:00:00', 'hour')).toBe('2024-03-15 10:00:00');
  });

  it('returns YYYY-MM-DD HH:mm:ss string for hour granularity', () => {
    const result = truncateDate('2024-06-15 18:45:30', 'hour');
    expect(result).toHaveLength(19);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('shiftDate(truncateDate(date_from, granularity)) — lifecycle extendedFrom alignment (issue #577)', () => {
  // The lifecycle query uses shiftDate(truncateDate(date_from, granularity), -1, granularity)
  // to compute extendedFrom. Truncating first ensures extendedFrom aligns to a period boundary
  // (Monday for weeks, 1st for months) even when date_from is not aligned.
  // Without truncation, shiftDate('2026-02-11', -1, 'week') = '2026-02-04' (Wednesday),
  // which cuts off Mon–Tue events that should be included in the look-back window.

  it('week: unaligned Wednesday date_from produces Monday extendedFrom', () => {
    // date_from = 2026-02-11 (Wednesday)
    // truncateDate → 2026-02-09 (Monday of that week)
    // shiftDate(-1 week) → 2026-02-02 (Monday of prior week)
    const extendedFrom = shiftDate(truncateDate('2026-02-11', 'week'), -1, 'week');
    expect(extendedFrom).toBe('2026-02-02');
    // Confirm it is a Monday (UTCDay = 1)
    expect(new Date(`${extendedFrom}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('week: already-aligned Monday date_from stays aligned after shift', () => {
    // date_from = 2026-02-09 (Monday) — already aligned
    // truncateDate → 2026-02-09 (no change)
    // shiftDate(-1 week) → 2026-02-02 (Monday)
    const extendedFrom = shiftDate(truncateDate('2026-02-09', 'week'), -1, 'week');
    expect(extendedFrom).toBe('2026-02-02');
    expect(new Date(`${extendedFrom}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('week: Sunday date_from produces Monday extendedFrom (Sunday rounds to Monday of same week)', () => {
    // date_from = 2026-02-08 (Sunday) — belongs to the week starting 2026-02-02
    // truncateDate → 2026-02-02 (Monday of that week)
    // shiftDate(-1 week) → 2026-01-26 (Monday)
    const extendedFrom = shiftDate(truncateDate('2026-02-08', 'week'), -1, 'week');
    expect(extendedFrom).toBe('2026-01-26');
    expect(new Date(`${extendedFrom}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('month: unaligned mid-month date_from produces 1st of prior month as extendedFrom', () => {
    // date_from = 2026-02-15 (15th of February)
    // truncateDate → 2026-02-01
    // shiftDate(-1 month) → 2026-01-01
    const extendedFrom = shiftDate(truncateDate('2026-02-15', 'month'), -1, 'month');
    expect(extendedFrom).toBe('2026-01-01');
  });

  it('month: already-aligned 1st of month produces 1st of prior month as extendedFrom', () => {
    // date_from = 2026-02-01 — already the 1st
    // truncateDate → 2026-02-01 (no change)
    // shiftDate(-1 month) → 2026-01-01
    const extendedFrom = shiftDate(truncateDate('2026-02-01', 'month'), -1, 'month');
    expect(extendedFrom).toBe('2026-01-01');
  });

  it('day: any date_from produces a 1-day-earlier extendedFrom (day granularity is always aligned)', () => {
    // For day granularity, truncateDate is a no-op, so the result equals shiftDate alone.
    const extendedFrom = shiftDate(truncateDate('2026-02-11', 'day'), -1, 'day');
    expect(extendedFrom).toBe('2026-02-10');
  });
});
