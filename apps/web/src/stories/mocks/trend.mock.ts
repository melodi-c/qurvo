import type { TrendSeriesResult, TrendDataPoint } from '@/api/generated/Api';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate an array of ISO date strings (YYYY-MM-DD) ending today.
 * @param count   Number of buckets to generate.
 * @param offsetDays  Shift the window back by this many extra days.
 */
export function makeBuckets(count: number, offsetDays = 0): string[] {
  const buckets: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i - offsetDays);
    buckets.push(d.toISOString().slice(0, 10));
  }
  return buckets;
}

/**
 * Build a TrendSeriesResult from a label, numeric values array, and bucket array.
 */
export function makeSeries(
  label: string,
  values: number[],
  buckets: string[],
  overrides: Partial<TrendSeriesResult> = {},
): TrendSeriesResult {
  const data: TrendDataPoint[] = buckets.map((bucket, i) => ({
    bucket,
    value: values[i] ?? 0,
  }));
  return {
    series_idx: 0,
    label,
    event_name: '$pageview',
    data,
    ...overrides,
  };
}

// ── Shared bucket sets ────────────────────────────────────────────────────────

export const BUCKETS_14 = makeBuckets(14);

/** Last bucket is today (potentially incomplete period). */
export const BUCKETS_14_WITH_TODAY = [
  ...makeBuckets(13, 1),
  new Date().toISOString().slice(0, 10),
];

// ── Named datasets ────────────────────────────────────────────────────────────

/** Single pageview series over 14 days. */
export const TREND_SERIES_14D: TrendSeriesResult[] = [
  makeSeries(
    'Pageviews',
    [120, 145, 132, 167, 198, 154, 143, 187, 210, 176, 189, 224, 211, 198],
    BUCKETS_14,
  ),
];

/** Three series with different events — useful for legend / colour tests. */
export const TREND_MULTI_SERIES: TrendSeriesResult[] = [
  makeSeries(
    'Pageviews',
    [120, 145, 132, 167, 198, 154, 143, 187, 210, 176, 189, 224, 211, 198],
    BUCKETS_14,
    { series_idx: 0 },
  ),
  makeSeries(
    'Sign Ups',
    [12, 18, 14, 22, 28, 19, 16, 25, 31, 22, 27, 33, 30, 26],
    BUCKETS_14,
    { series_idx: 1 },
  ),
  makeSeries(
    'Purchases',
    [4, 6, 5, 8, 10, 7, 6, 9, 11, 8, 10, 13, 11, 9],
    BUCKETS_14,
    { series_idx: 2 },
  ),
];

/** Bar-chart series — Sessions over 14 days. */
export const TREND_BAR_SERIES: TrendSeriesResult[] = [
  makeSeries(
    'Sessions',
    [85, 102, 98, 120, 145, 110, 95, 130, 155, 122, 138, 160, 148, 135],
    BUCKETS_14,
  ),
];

/** Compact-mode dual series for dashboard widget previews. */
export const TREND_COMPACT_SERIES: TrendSeriesResult[] = [
  makeSeries(
    'DAU',
    [340, 380, 420, 395, 460, 510, 490, 530, 515, 480, 545, 590, 575, 560],
    BUCKETS_14,
    { series_idx: 0 },
  ),
  makeSeries(
    'WAU',
    [820, 850, 880, 910, 940, 970, 990, 1010, 1020, 1040, 1060, 1085, 1090, 1100],
    BUCKETS_14,
    { series_idx: 1 },
  ),
];

/** Current period for compare-mode stories. */
export const TREND_COMPARE_CURRENT: TrendSeriesResult[] = [
  makeSeries(
    'Pageviews',
    [120, 145, 132, 167, 198, 154, 143, 187, 210, 176, 189, 224, 211, 198],
    BUCKETS_14,
  ),
];

/** Previous period for compare-mode stories. */
export const TREND_COMPARE_PREVIOUS: TrendSeriesResult[] = [
  makeSeries(
    'Pageviews',
    [100, 118, 109, 140, 162, 128, 118, 155, 178, 145, 160, 194, 182, 170],
    BUCKETS_14,
  ),
];

/** Series with an incomplete last bucket (today is partial). */
export const TREND_INCOMPLETE_SERIES: TrendSeriesResult[] = [
  makeSeries(
    'Events',
    [210, 245, 228, 267, 298, 255, 244, 289, 312, 278, 291, 320, 305, 87],
    BUCKETS_14_WITH_TODAY,
  ),
];

/** Two series suitable for formula mode (A / B * 100 = conversion rate). */
export const TREND_FORMULA_SERIES: TrendSeriesResult[] = [
  makeSeries(
    'Sign Ups',
    [12, 18, 14, 22, 28, 19, 16, 25, 31, 22, 27, 33, 30, 26],
    BUCKETS_14,
    { series_idx: 0 },
  ),
  makeSeries(
    'Pageviews',
    [120, 145, 132, 167, 198, 154, 143, 187, 210, 176, 189, 224, 211, 198],
    BUCKETS_14,
    { series_idx: 1 },
  ),
];
