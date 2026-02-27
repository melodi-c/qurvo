import type { FunnelStep, FunnelStepResult, FunnelBreakdownStepResult } from './funnel.types';

// ── Raw row types from ClickHouse ────────────────────────────────────────────

export interface RawFunnelRow {
  step_num: string;
  entered: string;
  next_step: string;
  avg_time_seconds?: string | null;
}

export interface RawBreakdownRow extends RawFunnelRow {
  breakdown_value: string;
}

// ── Step result computation ──────────────────────────────────────────────────

/**
 * Converts raw ClickHouse rows into FunnelStepResult[].
 * Single canonical implementation — used by all funnel paths.
 */
export function computeStepResults(
  rows: RawFunnelRow[],
  steps: FunnelStep[],
  numSteps: number,
): FunnelStepResult[] {
  const firstCount = Number(rows[0]?.entered ?? 0);
  return rows.map((row) => {
    const stepIdx = Number(row.step_num) - 1;
    const entered = Number(row.entered);
    const nextStep = Number(row.next_step);
    const isLast = stepIdx === numSteps - 1;
    const dropOff = isLast ? 0 : entered - nextStep;
    return {
      step: Number(row.step_num),
      label: steps[stepIdx]?.label ?? '',
      event_name: steps[stepIdx]?.event_name ?? '',
      count: entered,
      conversion_rate: firstCount > 0 ? Math.round((entered / firstCount) * 1000) / 10 : 0,
      drop_off: dropOff,
      drop_off_rate: isLast ? 0 : (entered > 0 ? Math.round((dropOff / entered) * 1000) / 10 : 0),
      avg_time_to_convert_seconds:
        !isLast && row.avg_time_seconds != null ? Math.round(Number(row.avg_time_seconds)) : null,
    };
  });
}

/**
 * Computes step results for a single cohort, attaching breakdown_value.
 */
export function computeCohortBreakdownStepResults(
  rows: RawFunnelRow[],
  steps: FunnelStep[],
  numSteps: number,
  breakdownValue: string,
): FunnelBreakdownStepResult[] {
  const stepResults = computeStepResults(rows, steps, numSteps);
  return stepResults.map((sr) => ({ ...sr, breakdown_value: breakdownValue }));
}

/**
 * Groups property breakdown rows by breakdown_value and computes results per group.
 */
export function computePropertyBreakdownResults(
  rows: RawBreakdownRow[],
  steps: FunnelStep[],
  numSteps: number,
): FunnelBreakdownStepResult[] {
  const grouped = new Map<string, RawBreakdownRow[]>();
  for (const row of rows) {
    const bv = (row.breakdown_value != null && row.breakdown_value !== '') ? row.breakdown_value : '(none)';
    if (!grouped.has(bv)) grouped.set(bv, []);
    grouped.get(bv)!.push(row);
  }

  const results: FunnelBreakdownStepResult[] = [];
  for (const [bv, bvRows] of grouped) {
    const stepResults = computeStepResults(bvRows, steps, numSteps);
    for (const sr of stepResults) {
      results.push({ ...sr, breakdown_value: bv });
    }
  }
  return results;
}

/**
 * Computes aggregate (sum across breakdowns) step results.
 */
export function computeAggregateSteps(
  allBreakdownSteps: FunnelBreakdownStepResult[],
  steps: FunnelStep[],
): FunnelStepResult[] {
  const stepTotals = new Map<number, number>();
  for (const r of allBreakdownSteps) {
    stepTotals.set(r.step, (stepTotals.get(r.step) ?? 0) + r.count);
  }
  const stepNums = [...stepTotals.keys()].sort((a, b) => a - b);
  const step1Total = stepTotals.get(stepNums[0]) ?? 0;
  return stepNums.map((sn, idx) => {
    const total = stepTotals.get(sn) ?? 0;
    const isLast = idx === stepNums.length - 1;
    const nextTotal = isLast ? 0 : (stepTotals.get(stepNums[idx + 1]) ?? 0);
    const dropOff = isLast ? 0 : total - nextTotal;
    const dropOffRate = isLast ? 0 : (total > 0 ? Math.round((dropOff / total) * 1000) / 10 : 0);
    return {
      step: sn,
      label: steps[sn - 1]?.label ?? '',
      event_name: steps[sn - 1]?.event_name ?? '',
      count: total,
      conversion_rate: step1Total > 0 ? Math.round((total / step1Total) * 1000) / 10 : 0,
      drop_off: dropOff,
      drop_off_rate: dropOffRate,
      avg_time_to_convert_seconds: null,
    };
  });
}
