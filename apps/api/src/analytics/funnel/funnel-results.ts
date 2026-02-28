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
  /** Total count of distinct non-empty breakdown values (from breakdown_total CTE, no LIMIT). */
  total_bd_count?: string;
}

// ── Step result computation ──────────────────────────────────────────────────

/**
 * Converts raw ClickHouse rows into FunnelStepResult[].
 * Single canonical implementation — used by all funnel paths.
 *
 * When rows is empty (no users entered the funnel in the queried period),
 * returns N zero-valued steps so the frontend can still render the funnel structure.
 */
export function computeStepResults(
  rows: RawFunnelRow[],
  steps: FunnelStep[],
  numSteps: number,
): FunnelStepResult[] {
  if (rows.length === 0) {
    return steps.map((s, i) => ({
      step: i + 1,
      label: s.label ?? '',
      event_name: s.event_name,
      count: 0,
      conversion_rate: 0,
      drop_off: 0,
      drop_off_rate: 0,
      avg_time_to_convert_seconds: null,
    }));
  }
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
        !isLast && row.avg_time_seconds != null && Number(row.avg_time_seconds) >= 0
          ? Math.round(Number(row.avg_time_seconds))
          : null,
    };
  });
}

/**
 * Computes step results for a single cohort, attaching breakdown_value and optional breakdown_label.
 *
 * @param breakdownValue - Unique identifier for the breakdown group (e.g. cohort UUID).
 * @param breakdownLabel - Optional human-readable display label (e.g. cohort name).
 */
export function computeCohortBreakdownStepResults(
  rows: RawFunnelRow[],
  steps: FunnelStep[],
  numSteps: number,
  breakdownValue: string,
  breakdownLabel?: string,
): FunnelBreakdownStepResult[] {
  const stepResults = computeStepResults(rows, steps, numSteps);
  return stepResults.map((sr) => ({
    ...sr,
    breakdown_value: breakdownValue,
    ...(breakdownLabel !== undefined ? { breakdown_label: breakdownLabel } : {}),
  }));
}

/**
 * Groups property breakdown rows by breakdown_value and computes results per group.
 *
 * Groups are sorted by step-1 entered count descending (most popular first),
 * with '(none)' always placed last among all groups. Within each group, rows
 * are ordered by step number ascending.
 */
export function computePropertyBreakdownResults(
  rows: RawBreakdownRow[],
  steps: FunnelStep[],
  numSteps: number,
): FunnelBreakdownStepResult[] {
  const grouped = new Map<string, RawBreakdownRow[]>();
  for (const row of rows) {
    const bv = (row.breakdown_value != null && row.breakdown_value !== '') ? row.breakdown_value : '(none)';
    if (!grouped.has(bv)) {grouped.set(bv, []);}
    grouped.get(bv)!.push(row);
  }

  // Compute step results per group and track the step-1 entered count for sorting.
  const groupEntries: Array<{ bv: string; step1Count: number; stepResults: FunnelBreakdownStepResult[] }> = [];
  for (const [bv, bvRows] of grouped) {
    const stepResults = computeStepResults(bvRows, steps, numSteps);
    const step1Count = stepResults.find((r) => r.step === 1)?.count ?? 0;
    groupEntries.push({
      bv,
      step1Count,
      stepResults: stepResults.map((sr) => ({ ...sr, breakdown_value: bv })),
    });
  }

  // Sort groups: (none) always last, then by step-1 entered count descending.
  groupEntries.sort((a, b) => {
    if (a.bv === '(none)' && b.bv !== '(none)') {return 1;}
    if (a.bv !== '(none)' && b.bv === '(none)') {return -1;}
    return b.step1Count - a.step1Count;
  });

  return groupEntries.flatMap((g) => g.stepResults);
}

/**
 * Computes aggregate (sum across breakdowns) step results.
 *
 * When allBreakdownSteps is empty (no users in any breakdown group),
 * returns N zero-valued steps so the frontend can still render the funnel structure.
 */
export function computeAggregateSteps(
  allBreakdownSteps: FunnelBreakdownStepResult[],
  steps: FunnelStep[],
): FunnelStepResult[] {
  if (allBreakdownSteps.length === 0) {
    return steps.map((s, i) => ({
      step: i + 1,
      label: s.label ?? '',
      event_name: s.event_name,
      count: 0,
      conversion_rate: 0,
      drop_off: 0,
      drop_off_rate: 0,
      avg_time_to_convert_seconds: null,
    }));
  }
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
