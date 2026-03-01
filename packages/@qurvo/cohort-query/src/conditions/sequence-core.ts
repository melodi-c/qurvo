import type { CohortEventFilter } from '@qurvo/db';
import { compileExprToSql } from '@qurvo/ch-query';
import { buildEventFilterClauses, allocCondIdx } from '../helpers';
import type { BuildContext } from '../types';

interface SequenceCondition {
  steps: { event_name: string; event_filters?: CohortEventFilter[] }[];
  time_window_days: number;
}

/**
 * Builds the array-based sequence detection expression that replaces
 * `sequenceMatch`.
 *
 * ClickHouse's `sequenceMatch` aggregate requires `DateTime` (seconds precision),
 * which truncates the `DateTime64(3)` `timestamp` column to seconds. Two events
 * within the same second become non-deterministic in ordering.
 *
 * Instead we:
 * 1. Classify each event into a step index via `multiIf(...)` (0 = no match).
 * 2. Per person, collect events as an array of `(timestamp_ms_UInt64, step_idx)`
 *    tuples sorted by timestamp — full millisecond precision is preserved.
 * 3. Use `arrayFold` to greedily walk the sorted array and match steps in order,
 *    enforcing the inter-step time window constraint at millisecond granularity.
 */
export function buildSequenceCore(
  cond: SequenceCondition,
  ctx: BuildContext,
): {
  /** The `multiIf(...)` expression that maps each event row to a 1-based step index (0 = no match). */
  stepIndexExpr: string;
  /** ClickHouse expression evaluating to 1 when the sorted event array contains the full ordered sequence within the time window. */
  seqMatchExpr: string;
  /** Parameter key for `time_window_days` (used in the outer WHERE scan horizon). */
  daysPk: string;
} {
  const { condIdx, daysPk } = allocCondIdx(ctx);
  const windowMsPk = `coh_${condIdx}_window_ms`;

  ctx.queryParams[daysPk] = cond.time_window_days;
  ctx.queryParams[windowMsPk] = cond.time_window_days * 86_400_000; // ms

  // Build step conditions for multiIf: (cond1, 1, cond2, 2, ..., 0)
  const multiIfBranches: string[] = [];
  cond.steps.forEach((step, i) => {
    const stepEventPk = `coh_${condIdx}_seq_${i}`;
    ctx.queryParams[stepEventPk] = step.event_name;

    let filterExpr = `event_name = {${stepEventPk}:String}`;
    if (step.event_filters && step.event_filters.length > 0) {
      // Build filter clauses as Expr, then compile to SQL for embedding in multiIf string
      const filterClauseExpr = buildEventFilterClauses(
        step.event_filters,
        `coh_${condIdx}_s${i}`,
        ctx.queryParams,
      );
      if (filterClauseExpr) {
        filterExpr += ' AND ' + compileExprToSql(filterClauseExpr).sql;
      }
    }
    multiIfBranches.push(filterExpr, String(i + 1));
  });
  multiIfBranches.push('0'); // default: no match

  const stepIndexExpr = `multiIf(${multiIfBranches.join(', ')})`;

  const totalSteps = cond.steps.length;

  // arrayFold walks sorted (ts_ms, step_idx) tuples.
  // Accumulator is a Tuple(next_step UInt32, prev_ts UInt64):
  //   next_step = next step index to match (1-based); starts at 1
  //   prev_ts   = timestamp of the last matched step (ms since epoch); 0 initially
  //
  // For each event:
  //   if step_idx == next_step AND (next_step == 1 OR ts_ms - prev_ts <= window_ms)
  //     -> advance: (next_step + 1, ts_ms)
  //   else -> keep accumulator unchanged
  //
  // After fold: acc.1 > totalSteps means all steps matched in order within time window.
  const seqMatchExpr = [
    `arrayFold(`,
    `  (acc, evt) -> if(`,
    `    evt.2 = acc.1 AND (acc.1 = 1 OR evt.1 - acc.2 <= {${windowMsPk}:UInt64}),`,
    `    (toUInt32(acc.1 + 1), evt.1),`,
    `    acc`,
    `  ),`,
    `  arraySort(x -> x.1, groupArray((toUInt64(toUnixTimestamp64Milli(timestamp)), step_idx))),`,
    `  (toUInt32(1), toUInt64(0))`,
    `).1 > ${totalSteps}`,
  ].join('\n          ');

  return { stepIndexExpr, seqMatchExpr, daysPk };
}
