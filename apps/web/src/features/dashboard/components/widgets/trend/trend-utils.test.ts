import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDataPoints, buildCumulativeDataPoints, isIncompleteBucket, snapAnnotationDateToBucket, generateBuckets } from './trend-utils';

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
  it('returns date with time suffix for day granularity', () => {
    expect(snapAnnotationDateToBucket('2026-02-15', 'day')).toBe('2026-02-15 00:00:00');
  });

  it('appends midnight for hour granularity', () => {
    expect(snapAnnotationDateToBucket('2026-02-15', 'hour')).toBe('2026-02-15 00:00:00');
  });

  it('snaps to first of month for month granularity', () => {
    expect(snapAnnotationDateToBucket('2026-02-15', 'month')).toBe('2026-02-01 00:00:00');
    expect(snapAnnotationDateToBucket('2026-03-31', 'month')).toBe('2026-03-01 00:00:00');
  });

  it('snaps to Monday for week granularity — date is Wednesday', () => {
    // 2026-02-25 is Wednesday → Monday is 2026-02-23
    expect(snapAnnotationDateToBucket('2026-02-25', 'week')).toBe('2026-02-23 00:00:00');
  });

  it('snaps to Monday for week granularity — date is Monday', () => {
    // 2026-02-23 is Monday → stays 2026-02-23
    expect(snapAnnotationDateToBucket('2026-02-23', 'week')).toBe('2026-02-23 00:00:00');
  });

  it('snaps to Monday for week granularity — date is Sunday', () => {
    // 2026-03-01 is Sunday → Monday is 2026-02-23
    expect(snapAnnotationDateToBucket('2026-03-01', 'week')).toBe('2026-02-23 00:00:00');
  });

  it('snaps to Monday for week granularity — date is Saturday', () => {
    // 2026-02-28 is Saturday → Monday is 2026-02-23
    expect(snapAnnotationDateToBucket('2026-02-28', 'week')).toBe('2026-02-23 00:00:00');
  });
});

describe('buildCumulativeDataPoints — single series', () => {
  it('accumulates values across buckets', () => {
    const series = [
      {
        label: 'Page View',
        data: [
          { bucket: '2026-02-20', value: 10 },
          { bucket: '2026-02-21', value: 20 },
          { bucket: '2026-02-22', value: 5 },
        ],
      },
    ];

    const result = buildCumulativeDataPoints(series);

    expect(result).toEqual([
      { bucket: '2026-02-20', 'Page View': 10 },
      { bucket: '2026-02-21', 'Page View': 30 },
      { bucket: '2026-02-22', 'Page View': 35 },
    ]);
  });

  it('returns empty array for empty series', () => {
    const result = buildCumulativeDataPoints([]);
    expect(result).toEqual([]);
  });
});

describe('buildCumulativeDataPoints — multiple series', () => {
  it('accumulates each series independently', () => {
    const series = [
      {
        label: 'A',
        data: [
          { bucket: '2026-02-20', value: 10 },
          { bucket: '2026-02-21', value: 20 },
        ],
      },
      {
        label: 'B',
        data: [
          { bucket: '2026-02-20', value: 3 },
          { bucket: '2026-02-21', value: 7 },
        ],
      },
    ];

    const result = buildCumulativeDataPoints(series);

    expect(result).toEqual([
      { bucket: '2026-02-20', A: 10, B: 3 },
      { bucket: '2026-02-21', A: 30, B: 10 },
    ]);
  });

  it('fills missing buckets with zero (no increment)', () => {
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

    const result = buildCumulativeDataPoints(series);

    expect(result).toHaveLength(2);
    // A has no data for bucket 2, cumulative stays at 5
    expect(result[0]).toMatchObject({ bucket: '2026-02-20', A: 5, B: 3 });
    expect(result[1]).toMatchObject({ bucket: '2026-02-21', A: 5, B: 10 });
  });
});

describe('buildCumulativeDataPoints — compare mode', () => {
  it('accumulates previous-period series independently', () => {
    const series = [
      {
        label: 'Page View',
        data: [
          { bucket: '2026-02-20', value: 10 },
          { bucket: '2026-02-21', value: 20 },
          { bucket: '2026-02-22', value: 5 },
        ],
      },
    ];

    const previousSeries = [
      {
        label: 'Page View',
        data: [
          { bucket: '2026-02-13', value: 8 },
          { bucket: '2026-02-14', value: 12 },
          { bucket: '2026-02-15', value: 3 },
        ],
      },
    ];

    const result = buildCumulativeDataPoints(series, previousSeries);

    expect(result).toEqual([
      { bucket: '2026-02-20', 'Page View': 10, 'prev_Page View': 8 },
      { bucket: '2026-02-21', 'Page View': 30, 'prev_Page View': 20 },
      { bucket: '2026-02-22', 'Page View': 35, 'prev_Page View': 23 },
    ]);
  });
});

// ---------- generateBuckets ----------

describe('generateBuckets — day granularity', () => {
  it('generates a bucket for each day in the range', () => {
    const result = generateBuckets('2026-02-20', '2026-02-23', 'day');
    expect(result).toEqual([
      '2026-02-20',
      '2026-02-21',
      '2026-02-22',
      '2026-02-23',
    ]);
  });

  it('returns a single bucket when dateFrom === dateTo', () => {
    const result = generateBuckets('2026-02-20', '2026-02-20', 'day');
    expect(result).toEqual(['2026-02-20']);
  });

  it('uses DateTime format when existingSample has space', () => {
    const result = generateBuckets('2026-02-20', '2026-02-22', 'day', '2026-02-20 00:00:00');
    expect(result).toEqual([
      '2026-02-20 00:00:00',
      '2026-02-21 00:00:00',
      '2026-02-22 00:00:00',
    ]);
  });
});

describe('generateBuckets — hour granularity', () => {
  it('generates hourly buckets for a single day', () => {
    const result = generateBuckets('2026-02-20', '2026-02-20', 'hour');
    expect(result).toHaveLength(24);
    expect(result[0]).toBe('2026-02-20');
    expect(result[23]).toBe('2026-02-20');
  });

  it('generates hourly buckets in DateTime format', () => {
    const result = generateBuckets('2026-02-20', '2026-02-20', 'hour', '2026-02-20 00:00:00');
    expect(result).toHaveLength(24);
    expect(result[0]).toBe('2026-02-20 00:00:00');
    expect(result[1]).toBe('2026-02-20 01:00:00');
    expect(result[23]).toBe('2026-02-20 23:00:00');
  });

  it('spans midnight for multi-day range', () => {
    const result = generateBuckets('2026-02-20', '2026-02-21', 'hour', '2026-02-20 00:00:00');
    expect(result).toHaveLength(48);
    expect(result[0]).toBe('2026-02-20 00:00:00');
    expect(result[24]).toBe('2026-02-21 00:00:00');
    expect(result[47]).toBe('2026-02-21 23:00:00');
  });
});

describe('generateBuckets — week granularity', () => {
  it('generates weekly buckets starting on Monday', () => {
    // 2026-02-20 is Friday => snaps to Monday 2026-02-16
    // 2026-03-06 is Friday => covers Monday 2026-03-02
    const result = generateBuckets('2026-02-20', '2026-03-06', 'week');
    expect(result).toEqual([
      '2026-02-16',
      '2026-02-23',
      '2026-03-02',
    ]);
  });

  it('includes week bucket even if range starts on a non-Monday', () => {
    // 2026-02-25 is Wednesday => snaps to Monday 2026-02-23
    const result = generateBuckets('2026-02-25', '2026-03-01', 'week');
    expect(result).toEqual([
      '2026-02-23',
    ]);
  });
});

describe('generateBuckets — month granularity', () => {
  it('generates monthly buckets as first day of month', () => {
    const result = generateBuckets('2026-01-15', '2026-03-10', 'month');
    expect(result).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
  });

  it('generates single month bucket', () => {
    const result = generateBuckets('2026-02-05', '2026-02-28', 'month');
    expect(result).toEqual(['2026-02-01']);
  });
});

describe('generateBuckets — relative dates', () => {
  it('resolves relative date tokens before generating', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-27T10:00:00Z'));

    const result = generateBuckets('-3d', '-0d', 'day');
    expect(result).toEqual([
      '2026-02-24',
      '2026-02-25',
      '2026-02-26',
      '2026-02-27',
    ]);
  });
});

// ---------- buildDataPoints with dateRange ----------

describe('buildDataPoints — with dateRange (full X axis)', () => {
  it('fills missing day buckets with zero', () => {
    const series = [
      {
        label: 'Page View',
        data: [{ bucket: '2026-02-21', value: 42 }],
      },
    ];

    const result = buildDataPoints(series, undefined, {
      dateFrom: '2026-02-20',
      dateTo: '2026-02-23',
      granularity: 'day',
    });

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ bucket: '2026-02-20', 'Page View': 0 });
    expect(result[1]).toMatchObject({ bucket: '2026-02-21', 'Page View': 42 });
    expect(result[2]).toMatchObject({ bucket: '2026-02-22', 'Page View': 0 });
    expect(result[3]).toMatchObject({ bucket: '2026-02-23', 'Page View': 0 });
  });

  it('works with empty series (all buckets zeroed)', () => {
    const series = [
      {
        label: 'Click',
        data: [],
      },
    ];

    const result = buildDataPoints(series, undefined, {
      dateFrom: '2026-02-20',
      dateTo: '2026-02-22',
      granularity: 'day',
    });

    expect(result).toHaveLength(3);
    expect(result.every((p) => p['Click'] === 0)).toBe(true);
  });

  it('preserves positional previous-period matching with filled buckets', () => {
    const series = [
      {
        label: 'A',
        data: [{ bucket: '2026-02-21', value: 10 }],
      },
    ];
    const previousSeries = [
      {
        label: 'A',
        data: [
          { bucket: '2026-02-13', value: 5 },
          { bucket: '2026-02-14', value: 7 },
          { bucket: '2026-02-15', value: 9 },
        ],
      },
    ];

    const result = buildDataPoints(series, previousSeries, {
      dateFrom: '2026-02-20',
      dateTo: '2026-02-22',
      granularity: 'day',
    });

    expect(result).toHaveLength(3);
    // Positional: index 0 -> prev[0]=5, index 1 -> prev[1]=7, index 2 -> prev[2]=9
    expect(result[0]).toMatchObject({ bucket: '2026-02-20', A: 0, prev_A: 5 });
    expect(result[1]).toMatchObject({ bucket: '2026-02-21', A: 10, prev_A: 7 });
    expect(result[2]).toMatchObject({ bucket: '2026-02-22', A: 0, prev_A: 9 });
  });

  it('does not change behavior when dateRange is undefined', () => {
    const series = [
      {
        label: 'X',
        data: [
          { bucket: '2026-02-20', value: 1 },
          { bucket: '2026-02-22', value: 3 },
        ],
      },
    ];

    // Without dateRange — only API buckets
    const result = buildDataPoints(series);
    expect(result).toHaveLength(2);
    expect(result[0].bucket).toBe('2026-02-20');
    expect(result[1].bucket).toBe('2026-02-22');
  });
});

describe('buildCumulativeDataPoints — with dateRange', () => {
  it('accumulates correctly with filled zero buckets', () => {
    const series = [
      {
        label: 'Page View',
        data: [
          { bucket: '2026-02-21', value: 10 },
          { bucket: '2026-02-23', value: 5 },
        ],
      },
    ];

    const result = buildCumulativeDataPoints(series, undefined, {
      dateFrom: '2026-02-20',
      dateTo: '2026-02-23',
      granularity: 'day',
    });

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ bucket: '2026-02-20', 'Page View': 0 });
    expect(result[1]).toMatchObject({ bucket: '2026-02-21', 'Page View': 10 });
    expect(result[2]).toMatchObject({ bucket: '2026-02-22', 'Page View': 10 }); // stays at 10
    expect(result[3]).toMatchObject({ bucket: '2026-02-23', 'Page View': 15 });
  });
});
