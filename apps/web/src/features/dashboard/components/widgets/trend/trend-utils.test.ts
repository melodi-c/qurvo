import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDataPoints, isIncompleteBucket, snapAnnotationDateToBucket } from './trend-utils';

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

describe('buildDataPoints — without previousSeries', () => {
  it('builds data points from a single series', () => {
    const series = [
      {
        label: 'Page View',
        data: [
          { bucket: '2026-02-20', value: 10 },
          { bucket: '2026-02-21', value: 20 },
        ],
      },
    ];

    const result = buildDataPoints(series);

    expect(result).toEqual([
      { bucket: '2026-02-20', 'Page View': 10 },
      { bucket: '2026-02-21', 'Page View': 20 },
    ]);
  });

  it('fills missing buckets with zero', () => {
    const series = [
      {
        label: 'A',
        data: [{ bucket: '2026-02-20', value: 5 }],
      },
      {
        label: 'B',
        data: [
          { bucket: '2026-02-20', value: 3 },
          { bucket: '2026-02-21', value: 7 },
        ],
      },
    ];

    const result = buildDataPoints(series);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ bucket: '2026-02-20', A: 5, B: 3 });
    // '2026-02-21' is only in series B, series A should be 0
    expect(result[1]).toMatchObject({ bucket: '2026-02-21', A: 0, B: 7 });
  });

  it('uses breakdown_value as part of the key when present', () => {
    const series = [
      {
        label: 'Click',
        breakdown_value: 'Chrome',
        data: [{ bucket: '2026-02-20', value: 15 }],
      },
    ];

    const result = buildDataPoints(series);

    expect(result[0]['Click (Chrome)']).toBe(15);
  });
});

describe('buildDataPoints — compare mode (with previousSeries)', () => {
  it('populates prev_* fields using positional index (not bucket string match)', () => {
    // Current period: Feb 20–21. Previous period: Feb 13–14.
    // Bucket strings are different — the old bug caused them to never match.
    const series = [
      {
        label: 'Page View',
        data: [
          { bucket: '2026-02-20', value: 100 },
          { bucket: '2026-02-21', value: 200 },
        ],
      },
    ];

    const previousSeries = [
      {
        label: 'Page View',
        data: [
          { bucket: '2026-02-13', value: 80 },
          { bucket: '2026-02-14', value: 90 },
        ],
      },
    ];

    const result = buildDataPoints(series, previousSeries);

    expect(result).toHaveLength(2);
    // First current bucket → first prev bucket by position
    expect(result[0]).toMatchObject({ bucket: '2026-02-20', 'Page View': 100, 'prev_Page View': 80 });
    // Second current bucket → second prev bucket by position
    expect(result[1]).toMatchObject({ bucket: '2026-02-21', 'Page View': 200, 'prev_Page View': 90 });
  });

  it('returns 0 for prev_* when previousSeries has fewer data points', () => {
    const series = [
      {
        label: 'Click',
        data: [
          { bucket: '2026-02-20', value: 50 },
          { bucket: '2026-02-21', value: 60 },
          { bucket: '2026-02-22', value: 70 },
        ],
      },
    ];

    const previousSeries = [
      {
        label: 'Click',
        // Only 2 data points vs 3 in current period
        data: [
          { bucket: '2026-02-13', value: 40 },
          { bucket: '2026-02-14', value: 45 },
        ],
      },
    ];

    const result = buildDataPoints(series, previousSeries);

    expect(result[0]['prev_Click']).toBe(40);
    expect(result[1]['prev_Click']).toBe(45);
    // No matching prev point for index 2 → 0
    expect(result[2]['prev_Click']).toBe(0);
  });

  it('handles multiple series in compare mode', () => {
    const series = [
      {
        label: 'A',
        data: [{ bucket: '2026-02-20', value: 10 }],
      },
      {
        label: 'B',
        data: [{ bucket: '2026-02-20', value: 20 }],
      },
    ];

    const previousSeries = [
      {
        label: 'A',
        data: [{ bucket: '2026-02-13', value: 5 }],
      },
      {
        label: 'B',
        data: [{ bucket: '2026-02-13', value: 15 }],
      },
    ];

    const result = buildDataPoints(series, previousSeries);

    expect(result[0]).toMatchObject({
      bucket: '2026-02-20',
      A: 10,
      B: 20,
      prev_A: 5,
      prev_B: 15,
    });
  });

  it('returns empty array when series is empty', () => {
    const result = buildDataPoints([], []);
    expect(result).toEqual([]);
  });
});

describe('isIncompleteBucket — timezone-aware', () => {
  it('uses project timezone for day granularity', () => {
    vi.useFakeTimers();
    // 2026-02-27 23:30 UTC = 2026-02-28 in Asia/Tokyo (UTC+9)
    vi.setSystemTime(new Date('2026-02-27T23:30:00Z'));

    // In UTC it's still Feb 27, but in Asia/Tokyo it's Feb 28
    expect(isIncompleteBucket('2026-02-28', 'day', 'Asia/Tokyo')).toBe(true);
    expect(isIncompleteBucket('2026-02-27', 'day', 'Asia/Tokyo')).toBe(false);

    // Without timezone (defaults to UTC), Feb 27 is today
    expect(isIncompleteBucket('2026-02-27', 'day')).toBe(true);
    expect(isIncompleteBucket('2026-02-28', 'day')).toBe(false);
  });

  it('uses project timezone for hour granularity', () => {
    vi.useFakeTimers();
    // 2026-02-27 14:35 UTC = 2026-02-27 23:35 in Asia/Tokyo
    vi.setSystemTime(new Date('2026-02-27T14:35:00Z'));

    // In Asia/Tokyo, hour 23 is the current hour
    expect(isIncompleteBucket('2026-02-27 23:00:00', 'hour', 'Asia/Tokyo')).toBe(true);
    expect(isIncompleteBucket('2026-02-27 14:00:00', 'hour', 'Asia/Tokyo')).toBe(false);

    // Without timezone (UTC), hour 14 is the current hour
    expect(isIncompleteBucket('2026-02-27 14:00:00', 'hour')).toBe(true);
  });

  it('uses project timezone for month granularity', () => {
    vi.useFakeTimers();
    // 2026-02-28 23:30 UTC = 2026-03-01 in Asia/Tokyo
    vi.setSystemTime(new Date('2026-02-28T23:30:00Z'));

    // In Asia/Tokyo it's March, so Feb bucket is complete
    expect(isIncompleteBucket('2026-03-01', 'month', 'Asia/Tokyo')).toBe(true);
    expect(isIncompleteBucket('2026-02-01', 'month', 'Asia/Tokyo')).toBe(false);

    // In UTC it's still February
    expect(isIncompleteBucket('2026-02-01', 'month')).toBe(true);
  });
});

describe('snapAnnotationDateToBucket', () => {
  it('returns date as-is for day granularity', () => {
    expect(snapAnnotationDateToBucket('2026-02-15', 'day')).toBe('2026-02-15');
  });

  it('appends midnight for hour granularity', () => {
    expect(snapAnnotationDateToBucket('2026-02-15', 'hour')).toBe('2026-02-15 00:00:00');
  });

  it('snaps to first of month for month granularity', () => {
    expect(snapAnnotationDateToBucket('2026-02-15', 'month')).toBe('2026-02-01');
    expect(snapAnnotationDateToBucket('2026-03-31', 'month')).toBe('2026-03-01');
  });

  it('snaps to Monday for week granularity — date is Wednesday', () => {
    // 2026-02-25 is Wednesday → Monday is 2026-02-23
    expect(snapAnnotationDateToBucket('2026-02-25', 'week')).toBe('2026-02-23');
  });

  it('snaps to Monday for week granularity — date is Monday', () => {
    // 2026-02-23 is Monday → stays 2026-02-23
    expect(snapAnnotationDateToBucket('2026-02-23', 'week')).toBe('2026-02-23');
  });

  it('snaps to Monday for week granularity — date is Sunday', () => {
    // 2026-03-01 is Sunday → Monday is 2026-02-23
    expect(snapAnnotationDateToBucket('2026-03-01', 'week')).toBe('2026-02-23');
  });

  it('snaps to Monday for week granularity — date is Saturday', () => {
    // 2026-02-28 is Saturday → Monday is 2026-02-23
    expect(snapAnnotationDateToBucket('2026-02-28', 'week')).toBe('2026-02-23');
  });
});
