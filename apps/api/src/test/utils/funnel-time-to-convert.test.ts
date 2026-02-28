import { describe, it, expect } from 'vitest';
import { parseTtcRows, type TtcAggRow } from '../../analytics/funnel/funnel-time-to-convert';

describe('parseTtcRows — histogram last bucket clamping', () => {
  it('last bucket to_seconds does not exceed Math.round(maxVal)', () => {
    // Example from the issue: range=9, binCount=2, binWidth=ceil(9/2)=5
    // Without fix: last bucket [6, 11), but maxVal=10
    // With fix:    last bucket [6, 10]
    const rows: TtcAggRow[] = [{
      avg_seconds: '5.5',
      sample_size: '8',
      min_seconds: '1',
      max_seconds: '10',
      // 8 durations spread across the range [1..10]
      durations: [1, 2, 3, 4, 6, 7, 8, 10],
    }];

    const result = parseTtcRows(rows, 0, 1);

    // Verify the last bin's to_seconds is clamped to Math.round(maxVal) = 10
    const lastBin = result.bins[result.bins.length - 1];
    expect(lastBin.to_seconds).toBeLessThanOrEqual(10);
    expect(lastBin.to_seconds).toBe(10);
  });

  it('non-last buckets use computed to_seconds (not clamped)', () => {
    // With enough durations to produce multiple bins, only the last is clamped.
    const rows: TtcAggRow[] = [{
      avg_seconds: '50',
      sample_size: '27', // cbrt(27)=3 → binCount=3
      min_seconds: '0',
      max_seconds: '9',
      // range=9, binCount=3, binWidth=ceil(9/3)=3
      durations: Array.from({ length: 27 }, (_, i) => (i % 10) * 0.9),
    }];

    const result = parseTtcRows(rows, 0, 1);

    // With binCount=3, binWidth=3: buckets [0,3), [3,6), [6,9]
    expect(result.bins.length).toBe(3);
    // First bin: to_seconds = 0 + 3 = 3 (not clamped)
    expect(result.bins[0].to_seconds).toBe(3);
    // Second bin: to_seconds = 0 + 6 = 6 (not clamped)
    expect(result.bins[1].to_seconds).toBe(6);
    // Last bin: clamped to Math.round(9) = 9
    expect(result.bins[2].to_seconds).toBe(9);
  });

  it('single bin case: to_seconds equals Math.round(maxVal)', () => {
    // When sample_size=1, binCount=max(1, min(60, ceil(cbrt(1))))=1
    const rows: TtcAggRow[] = [{
      avg_seconds: '5',
      sample_size: '2',
      min_seconds: '3',
      max_seconds: '7',
      durations: [3, 7],
    }];

    const result = parseTtcRows(rows, 0, 1);

    // binCount=max(1, min(60, ceil(cbrt(2))))=max(1,min(60,2))=2
    // range=4, binWidth=max(1, ceil(4/2))=2
    // bins: [3,5), [5,7]
    const lastBin = result.bins[result.bins.length - 1];
    expect(lastBin.to_seconds).toBe(7);
  });

  it('returns empty bins when sample_size is 0', () => {
    const rows: TtcAggRow[] = [{
      avg_seconds: null,
      sample_size: '0',
      min_seconds: null,
      max_seconds: null,
      durations: [],
    }];

    const result = parseTtcRows(rows, 0, 1);

    expect(result.bins).toEqual([]);
    expect(result.average_seconds).toBeNull();
    expect(result.sample_size).toBe(0);
  });

  it('range=0 returns single point bin (not affected by clamping)', () => {
    // When all durations are equal, range=0 produces a special single-point bin.
    const rows: TtcAggRow[] = [{
      avg_seconds: '5',
      sample_size: '3',
      min_seconds: '5',
      max_seconds: '5',
      durations: [5, 5, 5],
    }];

    const result = parseTtcRows(rows, 0, 1);

    expect(result.bins).toEqual([{ from_seconds: 5, to_seconds: 6, count: 3 }]);
  });
});
