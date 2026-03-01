import type { CohortEventFilter } from '@qurvo/db';
import type { Expr } from '@qurvo/ch-query';
import {
  and, col, eq, func, groupArray, gt, lambda, literal,
  multiIf, namedParam, raw, rawWithParams, toUInt32, toUInt64,
  toUnixTimestamp64Milli, tuple,
} from '@qurvo/ch-query';
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
  /** The `multiIf(...)` Expr that maps each event row to a 1-based step index (0 = no match). */
  stepIndexExpr: Expr;
  /** ClickHouse Expr evaluating to 1 when the sorted event array contains the full ordered sequence within the time window. */
  seqMatchExpr: Expr;
  /** Parameter key for `time_window_days` (used in the outer WHERE scan horizon). */
  daysPk: string;
} {
  const { condIdx, daysPk } = allocCondIdx(ctx);
  const windowMsPk = `coh_${condIdx}_window_ms`;

  ctx.queryParams[daysPk] = cond.time_window_days;
  ctx.queryParams[windowMsPk] = cond.time_window_days * 86_400_000; // ms

  // ── multiIf: classify each event into a 1-based step index (0 = no match) ──
  const branches: Array<{ condition: Expr; result: Expr }> = [];
  cond.steps.forEach((step, i) => {
    const stepEventPk = `coh_${condIdx}_seq_${i}`;
    ctx.queryParams[stepEventPk] = step.event_name;

    const eventNameMatch = eq(col('event_name'), namedParam(stepEventPk, 'String', step.event_name));
    const filterClause = buildEventFilterClauses(step.event_filters, `coh_${condIdx}_s${i}`, ctx.queryParams);

    branches.push({
      condition: filterClause ? and(eventNameMatch, filterClause) : eventNameMatch,
      result: literal(i + 1),
    });
  });

  const stepIndexExpr = multiIf(branches, literal(0));

  const totalSteps = cond.steps.length;

  // ── arrayFold: greedy ordered sequence matching with time window ──
  //
  // Accumulator: Tuple(next_step UInt32, prev_ts UInt64)
  //   next_step = next step index to match (1-based); starts at 1
  //   prev_ts   = timestamp of the last matched step (ms since epoch); 0 initially
  //
  // For each event:
  //   if step_idx == next_step AND (next_step == 1 OR ts_ms - prev_ts <= window_ms)
  //     -> advance: (next_step + 1, ts_ms)
  //   else -> keep accumulator unchanged
  //
  // After fold: result.1 > totalSteps means all steps matched in order within time window.

  // Lambda body uses rawWithParams because lambda params (acc, evt) with tuple
  // field access (.1, .2) and correct AND/OR precedence require raw SQL.
  // The window_ms named parameter is the only external dependency.
  const foldBody = rawWithParams(
    [
      'if(',
      '    evt.2 = acc.1 AND (acc.1 = 1 OR evt.1 - acc.2 <= {' + windowMsPk + ':UInt64}),',
      '    (toUInt32(acc.1 + 1), evt.1),',
      '    acc',
      '  )',
    ].join('\n          '),
    { [windowMsPk]: ctx.queryParams[windowMsPk] },
  );

  // Sorted array of (timestamp_ms, step_idx) tuples per person — pure AST
  const tuplePair = tuple(toUInt64(toUnixTimestamp64Milli(col('timestamp'))), col('step_idx'));
  const sortedArray = func('arraySort',
    lambda(['x'], raw('x.1')),
    groupArray(tuplePair),
  );

  // Initial accumulator: (next_step=1, prev_ts=0) — pure AST
  const initialAcc = tuple(toUInt32(literal(1)), toUInt64(literal(0)));

  // arrayFold(lambda, sorted_array, initial_acc) — pure AST wrapping rawWithParams body
  const foldResult = func('arrayFold',
    lambda(['acc', 'evt'], foldBody),
    sortedArray,
    initialAcc,
  );

  // result.1 > totalSteps — tupleElement is the function form of the .1 accessor
  const seqMatchExpr = gt(func('tupleElement', foldResult, literal(1)), literal(totalSteps));

  return { stepIndexExpr, seqMatchExpr, daysPk };
}
