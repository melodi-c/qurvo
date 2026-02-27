/**
 * Tests for use-formula-results — specifically the breakdown letter-mapping fix
 * and the formulaTotals ratio-aggregation fix.
 *
 * Because useFormulaResults is a React hook we test the underlying pure helpers
 * that can be exercised without a DOM/React runtime.
 *
 * The helpers are re-implemented inline here from their exported logic so we
 * don't need to mount a component.  The key invariants we verify:
 *   1. With breakdown, all rows sharing the same series_idx map to the same letter
 *      and their per-bucket values are summed together.
 *   2. For additive formulas (no '/') the total is the simple sum of per-period
 *      formula values.
 *   3. For ratio formulas ('/' present) the total is evaluated once on the
 *      aggregated totals per letter, not the sum of per-period ratios.
 */

import { describe, it, expect } from 'vitest';
import { evaluateFormula } from '@/features/dashboard/components/widgets/trend/formula-evaluator';
import { SERIES_LETTERS } from '@/features/dashboard/components/widgets/trend/trend-shared';
import type { TrendSeriesResult } from '@/api/generated/Api';

// ── Pure helpers duplicated from use-formula-results.ts for testing ──

function buildSeriesData(series: TrendSeriesResult[]): Map<string, Map<string, number>> {
  const seriesData = new Map<string, Map<string, number>>();
  for (const s of series) {
    const letter = SERIES_LETTERS[s.series_idx];
    if (!letter) continue;
    let bucketMap = seriesData.get(letter);
    if (!bucketMap) {
      bucketMap = new Map<string, number>();
      seriesData.set(letter, bucketMap);
    }
    for (const dp of s.data) {
      bucketMap.set(dp.bucket, (bucketMap.get(dp.bucket) ?? 0) + dp.value);
    }
  }
  return seriesData;
}

function computeFormulaTotal(
  expression: string,
  seriesData: Map<string, Map<string, number>>,
  dataPoints: { bucket: string; value: number }[],
): number | null {
  const hasDivision = expression.includes('/');

  if (!hasDivision) {
    return dataPoints.reduce((acc, dp) => acc + dp.value, 0);
  }

  const letterTotals = new Map<string, Map<string, number>>();
  for (const [letter, bucketMap] of seriesData) {
    let total = 0;
    for (const v of bucketMap.values()) total += v;
    letterTotals.set(letter, new Map([['__total__', total]]));
  }

  const results = evaluateFormula(expression, letterTotals);
  const dp = results.find((r) => r.bucket === '__total__');
  return dp?.value ?? null;
}

// ── Helper to build a minimal TrendSeriesResult ──

function makeSeries(
  series_idx: number,
  label: string,
  data: Record<string, number>,
  breakdown_value?: string,
): TrendSeriesResult {
  return {
    series_idx,
    label,
    event_name: label,
    breakdown_value,
    data: Object.entries(data).map(([bucket, value]) => ({ bucket, value })),
  };
}

// ── Tests ──

describe('buildSeriesData — letter mapping', () => {
  it('maps series_idx=0 to letter A, series_idx=1 to letter B (no breakdown)', () => {
    const series = [
      makeSeries(0, 'Clicks', { '2025-01-01': 100, '2025-01-02': 200 }),
      makeSeries(1, 'Impressions', { '2025-01-01': 1000, '2025-01-02': 2000 }),
    ];

    const sd = buildSeriesData(series);
    expect(sd.has('A')).toBe(true);
    expect(sd.has('B')).toBe(true);
    expect(sd.get('A')!.get('2025-01-01')).toBe(100);
    expect(sd.get('B')!.get('2025-01-01')).toBe(1000);
  });

  it('with breakdown, multiple rows sharing series_idx=0 aggregate into letter A', () => {
    // 2 series × 3 breakdown values → 6 rows total
    const series = [
      makeSeries(0, 'Clicks', { '2025-01-01': 40, '2025-01-02': 80 }, 'desktop'),
      makeSeries(0, 'Clicks', { '2025-01-01': 30, '2025-01-02': 60 }, 'mobile'),
      makeSeries(0, 'Clicks', { '2025-01-01': 30, '2025-01-02': 60 }, 'tablet'),
      makeSeries(1, 'Impressions', { '2025-01-01': 400, '2025-01-02': 800 }, 'desktop'),
      makeSeries(1, 'Impressions', { '2025-01-01': 300, '2025-01-02': 600 }, 'mobile'),
      makeSeries(1, 'Impressions', { '2025-01-01': 300, '2025-01-02': 600 }, 'tablet'),
    ];

    const sd = buildSeriesData(series);

    // Letter A = sum of all breakdown values for series_idx=0
    expect(sd.get('A')!.get('2025-01-01')).toBe(100); // 40+30+30
    expect(sd.get('A')!.get('2025-01-02')).toBe(200); // 80+60+60

    // Letter B = sum of all breakdown values for series_idx=1
    expect(sd.get('B')!.get('2025-01-01')).toBe(1000); // 400+300+300
    expect(sd.get('B')!.get('2025-01-02')).toBe(2000); // 800+600+600
  });

  it('breakdown: formula B/A*100 evaluates correctly across all breakdown groups', () => {
    const series = [
      makeSeries(0, 'Clicks', { '2025-01-01': 40, '2025-01-02': 80 }, 'desktop'),
      makeSeries(0, 'Clicks', { '2025-01-01': 60, '2025-01-02': 120 }, 'mobile'),
      makeSeries(1, 'Impressions', { '2025-01-01': 400, '2025-01-02': 800 }, 'desktop'),
      makeSeries(1, 'Impressions', { '2025-01-01': 600, '2025-01-02': 1200 }, 'mobile'),
    ];

    const sd = buildSeriesData(series);
    // A: Jan01=100, Jan02=200; B: Jan01=1000, Jan02=2000
    const results = evaluateFormula('B / A * 100', sd);

    // 1000/100*100 = 1000, 2000/200*100 = 1000
    expect(results).toEqual([
      { bucket: '2025-01-01', value: 1000 },
      { bucket: '2025-01-02', value: 1000 },
    ]);
  });
});

describe('computeFormulaTotal — ratio vs additive', () => {
  it('additive formula A + B: total is the sum of per-period values', () => {
    const series = [
      makeSeries(0, 'A', { '2025-01-01': 10, '2025-01-02': 20 }),
      makeSeries(1, 'B', { '2025-01-01': 5, '2025-01-02': 15 }),
    ];
    const sd = buildSeriesData(series);
    const dataPoints = evaluateFormula('A + B', sd);
    // dataPoints: [{bucket:'2025-01-01',value:15},{bucket:'2025-01-02',value:35}]
    const total = computeFormulaTotal('A + B', sd, dataPoints);
    expect(total).toBe(50); // 15 + 35
  });

  it('ratio formula B/A*100: total is aggregated numerator / denominator, NOT sum of per-period ratios', () => {
    const series = [
      makeSeries(0, 'Impressions', { '2025-01-01': 1000, '2025-01-02': 500 }),
      makeSeries(1, 'Clicks', { '2025-01-01': 50, '2025-01-02': 25 }),
    ];
    const sd = buildSeriesData(series);
    const dataPoints = evaluateFormula('B / A * 100', sd);
    // Per-period: 5%, 5% → naive sum = 10 (WRONG)
    // Aggregated: total_clicks=75, total_impressions=1500 → 75/1500*100 = 5 (CORRECT)

    const wrongTotal = dataPoints.reduce((acc, dp) => acc + dp.value, 0);
    expect(wrongTotal).toBe(10); // confirms the old wrong behaviour

    const correctTotal = computeFormulaTotal('B / A * 100', sd, dataPoints);
    expect(correctTotal).toBe(5); // 75 / 1500 * 100
  });

  it('ratio formula with uneven periods still aggregates correctly', () => {
    // Period 1: A=1000, B=100 → rate=10%
    // Period 2: A=100, B=50  → rate=50%
    // Naive sum: 60% (WRONG)
    // Aggregated: 150/1100*100 ≈ 13.6% (CORRECT)
    const series = [
      makeSeries(0, 'A', { '2025-01-01': 1000, '2025-01-02': 100 }),
      makeSeries(1, 'B', { '2025-01-01': 100, '2025-01-02': 50 }),
    ];
    const sd = buildSeriesData(series);
    const dataPoints = evaluateFormula('B / A * 100', sd);

    const wrongTotal = dataPoints.reduce((acc, dp) => acc + dp.value, 0);
    expect(wrongTotal).toBe(60);

    const correctTotal = computeFormulaTotal('B / A * 100', sd, dataPoints);
    expect(correctTotal).toBeCloseTo(150 / 1100 * 100, 5);
  });

  it('breakdown + ratio: total aggregates across all breakdown values', () => {
    // Series 0 (A = Impressions): desktop=800, mobile=200 → total=1000
    // Series 1 (B = Clicks): desktop=40, mobile=10 → total=50
    // Expected ratio total: 50/1000*100 = 5%
    const series = [
      makeSeries(0, 'Impressions', { '2025-01-01': 800 }, 'desktop'),
      makeSeries(0, 'Impressions', { '2025-01-01': 200 }, 'mobile'),
      makeSeries(1, 'Clicks', { '2025-01-01': 40 }, 'desktop'),
      makeSeries(1, 'Clicks', { '2025-01-01': 10 }, 'mobile'),
    ];
    const sd = buildSeriesData(series);
    const dataPoints = evaluateFormula('B / A * 100', sd);

    const correctTotal = computeFormulaTotal('B / A * 100', sd, dataPoints);
    expect(correctTotal).toBe(5); // 50 / 1000 * 100
  });
});
