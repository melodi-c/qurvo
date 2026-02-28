import { useMemo } from 'react';
import type { TrendSeriesResult, TrendFormula } from '@/api/generated/Api';
import { evaluateFormula, validateFormula } from '@/features/dashboard/components/widgets/trend/formula-evaluator';
import type { FormulaDataPoint } from '@/features/dashboard/components/widgets/trend/formula-evaluator';
import { SERIES_LETTERS } from '@/features/dashboard/components/widgets/trend/trend-shared';

export interface FormulaResult {
  formula: TrendFormula;
  dataPoints: FormulaDataPoint[];
}

interface UseFormulaResultsReturn {
  formulaResults: FormulaResult[];
  formulaKeys: string[];
  formulaTotals: (number | null)[];
}

/**
 * Build letter → (bucket → aggregated value) map from series.
 * With breakdown, multiple series rows share the same series_idx (letter) but
 * have different breakdown_value. We aggregate (sum) their values per bucket so
 * that letter A always represents "all breakdown groups of series 0".
 */
function buildSeriesData(series: TrendSeriesResult[]): Map<string, Map<string, number>> {
  const seriesData = new Map<string, Map<string, number>>();
  for (const s of series) {
    const letter = SERIES_LETTERS[s.series_idx];
    if (!letter) {continue;}
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

/**
 * Detect whether a formula expression contains a division operator.
 * Used to decide whether the "total" column should show a ratio or be hidden.
 */
function formulaHasDivision(expression: string): boolean {
  // Simple heuristic: presence of '/' outside of a string context.
  return expression.includes('/');
}

export function useFormulaResults(
  series: TrendSeriesResult[],
  formulas?: TrendFormula[],
): UseFormulaResultsReturn {
  // Compute the number of distinct series_idx values to determine available letters.
  const distinctSeriesCount = useMemo(() => {
    const idxSet = new Set<number>();
    for (const s of series) {idxSet.add(s.series_idx);}
    return idxSet.size;
  }, [series]);

  const validFormulas = useMemo(() => {
    if (!formulas?.length) {return [];}
    const availableLetters = SERIES_LETTERS.slice(0, distinctSeriesCount);
    return formulas.filter((f) => {
      if (!f.expression.trim()) {return false;}
      const result = validateFormula(f.expression, availableLetters);
      return result.valid;
    });
  }, [formulas, distinctSeriesCount]);

  const formulaResults = useMemo(() => {
    if (!validFormulas.length) {return [];}
    const seriesData = buildSeriesData(series);
    return validFormulas.map((f) => ({
      formula: f,
      dataPoints: evaluateFormula(f.expression, seriesData),
    }));
  }, [validFormulas, series]);

  const formulaKeys = useMemo(
    () => validFormulas.map((f) => `\u0192 ${f.label || f.expression}`),
    [validFormulas],
  );

  /**
   * Compute totals for each formula result.
   *
   * For additive formulas (no division) — sum all data-point values; this is
   * mathematically correct because sum(f(a_i, b_i)) == f(sum(a_i), sum(b_i))
   * when f is linear.
   *
   * For ratio/division formulas — evaluate the formula once on the per-letter
   * bucket totals so the result is "total_numerator / total_denominator" rather
   * than a meaningless sum of per-period ratios. Returns null if any required
   * series is missing.
   */
  const formulaTotals = useMemo((): (number | null)[] => {
    const seriesData = buildSeriesData(series);

    return validFormulas.map((f, idx) => {
      const fr = formulaResults[idx];
      if (!fr) {return null;}

      if (!formulaHasDivision(f.expression)) {
        // Additive formula — simple sum is correct.
        return fr.dataPoints.reduce((acc, dp) => acc + dp.value, 0);
      }

      // Ratio/division formula — evaluate on aggregated totals per letter.
      const letterTotals = new Map<string, Map<string, number>>();
      for (const [letter, bucketMap] of seriesData) {
        let total = 0;
        for (const v of bucketMap.values()) {total += v;}
        // Wrap in a single-bucket map so evaluateFormula can process it.
        letterTotals.set(letter, new Map([['__total__', total]]));
      }

      const results = evaluateFormula(f.expression, letterTotals);
      const dp = results.find((r) => r.bucket === '__total__');
      return dp?.value ?? null;
    });
  }, [validFormulas, formulaResults, series]);

  return { formulaResults, formulaKeys, formulaTotals };
}
