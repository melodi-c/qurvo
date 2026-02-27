import { describe, it, expect, vi, afterEach } from 'vitest';
import { isIncompleteBucket } from './trend-utils';

afterEach(() => {
  vi.useRealTimers();
});

describe('isIncompleteBucket — hour granularity', () => {
  it('returns true when bucket matches the current hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T14:35:00Z'));

    expect(isIncompleteBucket('2026-02-27 14:00:00', 'hour')).toBe(true);
  });

  it('returns false when bucket is a previous hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T14:35:00Z'));

    expect(isIncompleteBucket('2026-02-27 13:00:00', 'hour')).toBe(false);
  });

  it('returns false when bucket is a future hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T14:35:00Z'));

    expect(isIncompleteBucket('2026-02-27 15:00:00', 'hour')).toBe(false);
  });

  it('returns false when bucket is yesterday same hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T14:35:00Z'));

    expect(isIncompleteBucket('2026-02-26 14:00:00', 'hour')).toBe(false);
  });
});

describe('isIncompleteBucket — day granularity', () => {
  it('returns true for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T10:00:00Z'));

    expect(isIncompleteBucket('2026-02-27', 'day')).toBe(true);
  });

  it('returns false for yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T10:00:00Z'));

    expect(isIncompleteBucket('2026-02-26', 'day')).toBe(false);
  });
});

describe('isIncompleteBucket — week granularity', () => {
  it('returns true when bucket date is within the current week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T10:00:00Z'));

    // 3 days ago — still in the current week window
    expect(isIncompleteBucket('2026-02-24', 'week')).toBe(true);
  });

  it('returns false when bucket date is 7 or more days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T10:00:00Z'));

    expect(isIncompleteBucket('2026-02-20', 'week')).toBe(false);
  });
});

describe('isIncompleteBucket — month granularity', () => {
  it('returns true for the current month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T10:00:00Z'));

    expect(isIncompleteBucket('2026-02-01', 'month')).toBe(true);
  });

  it('returns false for a previous month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T10:00:00Z'));

    expect(isIncompleteBucket('2026-01-01', 'month')).toBe(false);
  });
});

describe('isIncompleteBucket — no granularity', () => {
  it('returns false when granularity is undefined', () => {
    expect(isIncompleteBucket('2026-02-27 14:00:00', undefined)).toBe(false);
  });
});
