import { useMemo } from 'react';
import type { TrendSeriesResult, TrendFormula } from '@/api/generated/Api';
import { evaluateFormula, validateFormula } from './formula-evaluator';
import type { FormulaDataPoint } from './formula-evaluator';
import { SERIES_LETTERS } from './trend-shared';

export interface FormulaResult {
  formula: TrendFormula;
  dataPoints: FormulaDataPoint[];
}

interface UseFormulaResultsReturn {
  formulaResults: FormulaResult[];
  formulaKeys: string[];
  formulaTotals: number[];
}

export function useFormulaResults(
  series: TrendSeriesResult[],
  formulas?: TrendFormula[],
): UseFormulaResultsReturn {
  const validFormulas = useMemo(() => {
    if (!formulas?.length) return [];
    const availableLetters = SERIES_LETTERS.slice(0, series.length);
    return formulas.filter((f) => {
      if (!f.expression.trim()) return false;
      const result = validateFormula(f.expression, availableLetters);
      return result.valid;
    });
  }, [formulas, series.length]);

  const formulaResults = useMemo(() => {
    if (!validFormulas.length) return [];

    const seriesData = new Map<string, Map<string, number>>();
    series.forEach((s, idx) => {
      const letter = SERIES_LETTERS[idx];
      if (!letter) return;
      const bucketMap = new Map<string, number>();
      for (const dp of s.data) {
        bucketMap.set(dp.bucket, dp.value);
      }
      seriesData.set(letter, bucketMap);
    });

    return validFormulas.map((f) => ({
      formula: f,
      dataPoints: evaluateFormula(f.expression, seriesData),
    }));
  }, [validFormulas, series]);

  const formulaKeys = useMemo(
    () => validFormulas.map((f) => `\u0192 ${f.label || f.expression}`),
    [validFormulas],
  );

  const formulaTotals = useMemo(
    () => formulaResults.map((fr) => fr.dataPoints.reduce((acc, dp) => acc + dp.value, 0)),
    [formulaResults],
  );

  return { formulaResults, formulaKeys, formulaTotals };
}
