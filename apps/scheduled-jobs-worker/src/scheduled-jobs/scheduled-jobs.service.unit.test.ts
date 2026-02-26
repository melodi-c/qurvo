import { describe, it, expect } from 'vitest';
import type { AiScheduledJob } from '@qurvo/db';
import { isDue } from './scheduled-jobs.service';

function makeJob(schedule: string, last_run_at: Date | null): Pick<AiScheduledJob, 'last_run_at' | 'schedule'> {
  return { schedule, last_run_at };
}

describe('isDue', () => {
  describe('never ran before', () => {
    it('returns true when last_run_at is null', () => {
      expect(isDue(makeJob('daily', null), new Date())).toBe(true);
      expect(isDue(makeJob('weekly', null), new Date())).toBe(true);
      expect(isDue(makeJob('monthly', null), new Date())).toBe(true);
    });
  });

  describe('daily schedule', () => {
    it('returns false when less than 24h have elapsed', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-16T09:59:59Z'); // 23h59m59s later
      expect(isDue(makeJob('daily', last), now)).toBe(false);
    });

    it('returns true when exactly 24h have elapsed', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-16T10:00:00Z'); // exactly 24h later
      expect(isDue(makeJob('daily', last), now)).toBe(true);
    });

    it('returns true when more than 24h have elapsed', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-17T10:00:00Z'); // 48h later
      expect(isDue(makeJob('daily', last), now)).toBe(true);
    });
  });

  describe('weekly schedule', () => {
    it('returns false when less than 7 days have elapsed', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-21T09:59:59Z'); // 6d23h59m59s later
      expect(isDue(makeJob('weekly', last), now)).toBe(false);
    });

    it('returns true when exactly 7 days have elapsed', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-01-22T10:00:00Z'); // exactly 7 days later
      expect(isDue(makeJob('weekly', last), now)).toBe(true);
    });

    it('returns true when more than 7 days have elapsed', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-02-01T10:00:00Z'); // more than 7 days later
      expect(isDue(makeJob('weekly', last), now)).toBe(true);
    });
  });

  describe('monthly schedule — calendar month (not 30-day approximation)', () => {
    it('returns false one second before calendar month boundary', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-02-15T09:59:59Z'); // one second before the calendar month boundary
      expect(isDue(makeJob('monthly', last), now)).toBe(false);
    });

    it('returns true at exactly the calendar month boundary', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-02-15T10:00:00Z'); // exactly one calendar month later
      expect(isDue(makeJob('monthly', last), now)).toBe(true);
    });

    it('returns true when more than one calendar month has elapsed', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-03-01T00:00:00Z'); // well past one month
      expect(isDue(makeJob('monthly', last), now)).toBe(true);
    });

    it('handles February correctly — 28-day month does not trigger job early', () => {
      // last_run = Feb 15 → next run = Mar 15 (calendar month)
      // With old 30-day logic: Feb 15 + 30 days = Mar 17 (two days too late)
      const last = new Date('2025-02-15T10:00:00Z');
      const nextRunCalendar = new Date('2025-03-15T10:00:00Z');

      expect(isDue(makeJob('monthly', last), nextRunCalendar)).toBe(true);

      // Old 30-day boundary (Mar 17) would also be true, but calendar month (Mar 15) should trigger first
      const thirtyDaysLater = new Date(last.getTime() + 30 * 24 * 60 * 60 * 1000); // Mar 17
      // Calendar should fire on Mar 15, which is before Mar 17
      expect(nextRunCalendar < thirtyDaysLater).toBe(true);
    });

    it('handles January (31-day month) — last_run Dec 15 → next run Jan 15, not Jan 14', () => {
      // Dec 15 + 1 calendar month = Jan 15
      // With old 30-day logic: Dec 15 + 30 days = Jan 14 (one day early, before calendar month)
      const last = new Date('2024-12-15T10:00:00Z');
      const nextRunCalendar = new Date('2025-01-15T10:00:00Z');

      // Calendar month boundary: should be due
      expect(isDue(makeJob('monthly', last), nextRunCalendar)).toBe(true);

      // Old 30-day boundary (Jan 14): should NOT be due yet with calendar-month logic
      const thirtyDaysLater = new Date(last.getTime() + 30 * 24 * 60 * 60 * 1000); // Jan 14
      expect(thirtyDaysLater.toISOString().startsWith('2025-01-14')).toBe(true); // sanity check
      expect(isDue(makeJob('monthly', last), thirtyDaysLater)).toBe(false);
    });

    it('handles end-of-month overflow — last_run Jan 31 uses JS setMonth overflow (→ Mar 3)', () => {
      // JS Date.setMonth overflows: Jan 31 + 1 month → March 3 (not Feb 28)
      // This is the standard JS behavior; the implementation uses setMonth as specified
      const last = new Date('2025-01-31T12:00:00Z');
      // setMonth(1) on Jan 31 → Feb 31 overflows to Mar 3
      const nextRun = new Date(last);
      nextRun.setMonth(nextRun.getMonth() + 1);
      // nextRun is now 2025-03-03T12:00:00Z

      // Just before the overflow date → not due
      const dayBefore = new Date(nextRun.getTime() - 24 * 60 * 60 * 1000);
      expect(isDue(makeJob('monthly', last), dayBefore)).toBe(false);

      // At or after the overflow date → due
      expect(isDue(makeJob('monthly', last), nextRun)).toBe(true);
    });
  });

  describe('unknown schedule', () => {
    it('returns false for an unknown schedule type', () => {
      const last = new Date('2025-01-15T10:00:00Z');
      const now = new Date('2025-12-31T10:00:00Z');
      expect(isDue(makeJob('yearly', last), now)).toBe(false);
    });
  });
});
