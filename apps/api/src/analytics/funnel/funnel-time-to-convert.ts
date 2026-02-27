import type { ClickHouseClient } from '@qurvo/clickhouse';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { buildCohortClause, RESOLVED_PERSON, toChTs } from '../../utils/clickhouse-helpers';
import type { TimeToConvertParams, TimeToConvertResult, TimeToConvertBin, FunnelOrderType } from './funnel.types';
import {
  resolveWindowSeconds,
  resolveStepEventNames,
  buildStepCondition,
  buildSamplingClause,
  buildWindowFunnelExpr,
  buildAllEventNames,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  validateExclusions,
  validateUnorderedSteps,
  funnelTsExpr,
  type FunnelChQueryParams,
} from './funnel-sql-shared';

/**
 * ClickHouse query parameters for the time-to-convert query.
 *
 * Static keys:
 *   project_id   — UUID of the project
 *   from         — start of the date range (ClickHouse DateTime string)
 *   to           — end of the date range (ClickHouse DateTime string)
 *   window       — conversion window in seconds (UInt64)
 *   step_names   — flat list of all step event names (Array(String))
 *   to_step_num  — 1-based target step number (UInt64)
 *
 * Dynamic keys:
 *   step_{i}           — primary event name for step i (String)
 *   step_{i}_names     — all event names for step i when using OR-logic (Array(String))
 *   step_{i}_{prefix}_f{j}_v — filter value for step i, filter j
 *   sample_pct         — sampling percentage 0-100 (UInt8), present only when sampling
 */
interface TtcChQueryParams extends FunnelChQueryParams {
  step_names: string[];
  to_step_num: number;
  window_seconds: number;
}

/** Maximum number of bins in the histogram. */
const MAX_BINS = 60;

/**
 * Compute time-to-convert stats and histogram in a single ClickHouse query.
 *
 * Two-level CTE structure (single events scan):
 *   funnel_raw      — per-person windowFunnel + groupArrayIf per step (one full scan)
 *   funnel_per_user — derives sequence-aware step_i_ms from raw arrays:
 *                     step_0_ms = arrayMin(step_0_arr)
 *                     step_i_ms = first occurrence of step i that is >= step_{i-1}_ms
 *                     This prevents earliest-ever occurrences (before step 0) from
 *                     skewing TTC when from_step > 0.
 *   converted       — filter to users who reached to_step within window
 *   final SELECT    — computes avg, median, min, max, count AND collects all
 *                     duration_seconds values in groupArray — all in one pass.
 *
 * Histogram binning is done in JS from the returned durations array:
 *   - bin_count and bin_width are computed from server-side min/max/count
 *   - a simple for-loop bins each duration (no Math.min/max spread, no V8 stack risk)
 */

export async function queryFunnelTimeToConvert(
  ch: ClickHouseClient,
  params: TimeToConvertParams,
): Promise<TimeToConvertResult> {
  const { steps, project_id, from_step: fromStep, to_step: toStep } = params;
  const exclusions = params.exclusions ?? [];
  const numSteps = steps.length;
  const windowSeconds = resolveWindowSeconds(params);
  const orderType: FunnelOrderType = params.funnel_order_type ?? 'ordered';

  if (fromStep >= toStep) {
    throw new AppBadRequestException('from_step must be strictly less than to_step');
  }
  if (toStep >= numSteps) {
    throw new AppBadRequestException(`to_step ${toStep} out of range (max ${numSteps - 1})`);
  }

  validateExclusions(exclusions, numSteps);

  if (orderType === 'unordered') {
    validateUnorderedSteps(steps);
  }

  const allEventNames = buildAllEventNames(steps, exclusions);

  const hasTz = !!(params.timezone && params.timezone !== 'UTC');
  const queryParams: TtcChQueryParams = {
    project_id,
    from: toChTs(params.date_from, false, params.timezone),
    to: toChTs(params.date_to, true, params.timezone),
    window: windowSeconds,
    num_steps: steps.length,
    all_event_names: allEventNames,
    step_names: allEventNames,
    to_step_num: toStep + 1,
    window_seconds: windowSeconds,
  };
  if (hasTz) queryParams.tz = params.timezone;
  steps.forEach((s, i) => {
    const names = resolveStepEventNames(s);
    queryParams[`step_${i}`] = names[0];
    if (names.length > 1) {
      queryParams[`step_${i}_names`] = names;
    }
  });

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams, toChTs(params.date_to, true, params.timezone), toChTs(params.date_from, false, params.timezone));

  const samplingClause = buildSamplingClause(params.sampling_factor, queryParams);

  // Build step conditions once and reuse
  const stepConds = steps.map((s, i) => buildStepCondition(s, i, queryParams));
  const stepConditions = stepConds.join(', ');

  // Build exclusion columns and CTE (same pattern as ordered/unordered funnel)
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams)
    : [];

  if (orderType === 'unordered') {
    return buildUnorderedTtcSql(ch, queryParams, stepConds, exclColumns, exclusions, fromStep, toStep, cohortClause, samplingClause);
  }

  // Per-step timestamp arrays — collect all timestamps per step in a single scan.
  // We use groupArrayIf to get all occurrences so we can find the first one
  // that comes after the previous step (i.e. matches the windowFunnel sequence).
  // Step 0 uses an anchor-aware formula (see seq_step_0 below). For step i > 0 we derive the
  // "sequence-aware" timestamp in the step_timestamps CTE.
  //
  // Also collect last_step_prelim_ms = global min of step_{toStep} timestamps.
  // This is used in seq_step_0 to identify the correct step_0 anchor for the successful
  // conversion window — matching the approach used in funnel-ordered.sql.ts for first_step_ms.
  // Without this, step_0_ms = arrayMin(step_0_arr) could pick an early step_0 that is outside
  // the conversion window of the later step_toStep, causing TTC to be overstated or the user
  // to be wrongly excluded by the duration_seconds <= window_seconds filter (issue #498).
  const stepArrayCols = stepConds.map(
    (cond, i) => `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS step_${i}_arr`,
  ).join(',\n            ');

  const fromCol = `step_${fromStep}_ms`;
  const toCol = `step_${toStep}_ms`;

  // Aggregation expressions for funnel_raw (e.g. "groupArrayIf(...) AS excl_0_from_arr")
  const exclColumnsSQL = exclColumns.length > 0
    ? ',\n            ' + exclColumns.join(',\n            ')
    : '';
  // Pass-through aliases for funnel_per_user (e.g. "excl_0_from_arr")
  const exclColumnAliases = exclColumns.map((expr) => {
    const match = /AS (\w+)$/.exec(expr.trim());
    return match ? match[1]! : expr;
  });
  const exclAliasSQL = exclColumnAliases.length > 0
    ? ',\n      ' + exclColumnAliases.join(',\n      ')
    : '';
  const excludedUsersCTE = exclusions.length > 0
    ? buildExcludedUsersCTE(exclusions) + ',\n  '
    : '';
  // Extra AND condition appended to the WHERE clause in the `converted` CTE
  const exclAndCondition = exclusions.length > 0
    ? '\n        AND person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  // Build a chain of per-step CTEs to compute sequence-aware step timestamps without
  // exponential SQL growth. The old approach inlined prevExpr twice per level, causing
  // O(2^n) SQL size. This approach introduces one CTE per step where each step refers
  // to the previous step's column alias — giving O(n) SQL size regardless of step count.
  //
  // CTE chain structure:
  //   funnel_raw       — per-person windowFunnel + per-step timestamp arrays + last_step_prelim_ms (one full scan)
  //   seq_step_0       — step_0_ms = anchor-aware formula using last_step_prelim_ms (issue #498)
  //   seq_step_1       — step_1_ms = first step_1_arr element >= step_0_ms
  //   seq_step_i       — step_i_ms = first step_i_arr element >= step_{i-1}_ms
  //   funnel_per_user  — selects all step_{i}_ms columns + max_step from the last seq CTE
  //
  // Each seq_step CTE adds exactly one column (O(1) text). References to the previous
  // step use a simple alias name ("step_{i-1}_ms"), not an inline expression.
  //
  // Step 0 uses an anchor-aware formula instead of a bare arrayMin (issue #498):
  //   step_0_ms = earliest step_0 whose distance to last_step_prelim_ms is <= window.
  //   This matches the anchor that windowFunnel('ordered') actually used for the successful
  //   conversion sequence. Without this, when a user has multiple step_0 events and only
  //   a later step_0 can anchor a valid chain, arrayMin would pick the earlier step_0,
  //   making the computed TTC exceed the window and wrongly excluding the user from stats.
  //
  // last_step_prelim_ms is the global minIf of step_{toStep} timestamps collected in
  //   funnel_raw. Using the global min (without sequencing) mirrors the approach in
  //   funnel-ordered.sql.ts (first_step_ms fix for issue #493) and is correct because:
  //   windowFunnel picks the earliest step_0 from which the chain reaches the last step —
  //   filtering step_0 by window distance to the earliest last-step timestamp gives exactly
  //   the set of valid anchors, and arrayMin selects the one windowFunnel used.
  //
  // Steps i > 0 use: if(notEmpty(filtered), arrayMin(filtered), 0)
  //   where filtered = arrayFilter(t -> t >= step_{i-1}_ms, step_i_arr)
  //   The filtered array is computed once per lambda call, eliminating the duplication.
  const winMsExpr = `toInt64({window:UInt64}) * 1000`;
  const seqStepCTEs: string[] = [];
  for (let i = 0; i < numSteps; i++) {
    const prevCTE = i === 0 ? 'funnel_raw' : `seq_step_${i - 1}`;
    const passThrough = [
      'person_id',
      'max_step',
      'last_step_prelim_ms',
      // pass through all step arrays
      ...Array.from({ length: numSteps }, (_, j) => `step_${j}_arr`),
      // pass through previously computed step_ms columns
      ...Array.from({ length: i }, (_, j) => `step_${j}_ms`),
      // pass through exclusion aliases
      ...exclColumnAliases,
    ].join(',\n        ');

    let stepMsExpr: string;
    if (i === 0) {
      // Anchor-aware step_0_ms: find the earliest step_0 that is within window of
      // last_step_prelim_ms (the global minIf of step_{toStep} timestamps).
      //
      // This is the same approach used for first_step_ms in funnel-ordered.sql.ts (issue #493):
      //   filter t0_arr to t0 <= last_step_ms AND last_step_ms - t0 <= window
      //   then take arrayMin of the filtered set.
      //
      // Example (window=30s): step_0@T=0 (failed: step_1@T=35s > window), step_0@T=25s (ok)
      //   last_step_prelim_ms = 35s, step_0_arr = [0ms, 25000ms]
      //   filtered = [25000ms] (0ms excluded: 35000-0 = 35000 > 30000)
      //   step_0_ms = 25000ms ✓  (not 0ms, which would give TTC=35s, wrongly excluded)
      stepMsExpr =
        `if(\n          notEmpty(arrayFilter(t0 -> t0 <= last_step_prelim_ms AND last_step_prelim_ms - t0 <= ${winMsExpr} AND last_step_prelim_ms > 0, step_0_arr)),\n          toInt64(arrayMin(arrayFilter(t0 -> t0 <= last_step_prelim_ms AND last_step_prelim_ms - t0 <= ${winMsExpr} AND last_step_prelim_ms > 0, step_0_arr))),\n          toInt64(0)\n        ) AS step_0_ms`;
    } else {
      // Reference to step_{i-1}_ms is a simple column alias from the previous CTE —
      // O(1) text per step regardless of chain depth. The double arrayFilter here
      // is fine: each CTE level references the alias name, not a growing inline expression.
      stepMsExpr =
        `if(notEmpty(arrayFilter(t${i} -> t${i} >= step_${i - 1}_ms, step_${i}_arr)),` +
        ` arrayMin(arrayFilter(t${i} -> t${i} >= step_${i - 1}_ms, step_${i}_arr)),` +
        ` 0) AS step_${i}_ms`;
    }

    seqStepCTEs.push(
      `seq_step_${i} AS (\n      SELECT\n        ${passThrough},\n        ${stepMsExpr}\n      FROM ${prevCTE}\n    )`,
    );
  }

  const lastSeqCTE = `seq_step_${numSteps - 1}`;
  const stepMsCols = Array.from({ length: numSteps }, (_, i) => `step_${i}_ms`).join(',\n        ');

  // Single query: scan events once, compute both stats and raw durations.
  //
  // CTE chain structure (linear SQL growth — O(n) not O(2^n)):
  //   funnel_raw    — per-person windowFunnel + per-step arrays + last_step_prelim_ms (one full scan)
  //   seq_step_0    — add step_0_ms = anchor-aware formula using last_step_prelim_ms (issue #498)
  //   seq_step_i    — add step_i_ms = min(step_i_arr elements >= step_{i-1}_ms)
  //   funnel_per_user — select step_*_ms + max_step from last seq CTE (drops last_step_prelim_ms)
  //   converted     — filter to users who completed to_step; compute duration
  //   final SELECT  — aggregates stats + collects durations for histogram binning in JS
  //
  // Histogram binning is performed in JS using a simple loop:
  //   - bin_count = max(1, min(MAX_BINS, ceil(cbrt(sample_size)))) — same as before
  //   - bin_width = range == 0 ? 60 : max(1, ceil(range / bin_count))  — same as before
  //   - each duration is binned with: clamp(floor((d - min) / bin_width), 0, bin_count-1)
  // This avoids the V8 spread-argument stack overflow (no Math.min/max spread) because
  // min and max are returned from ClickHouse as scalar values, not derived from the array.

  // Strict mode requires scanning ALL events for qualifying users (not just step events),
  // so that windowFunnel('strict_order') can detect and reset on intervening events.
  // We pre-filter to users who have at least one funnel step event (same pattern as the
  // main ordered-funnel query).
  const fromExpr = funnelTsExpr('from', queryParams);
  const toExpr = funnelTsExpr('to', queryParams);

  const strictUserFilter = orderType === 'strict' ? [
    '',
    '                AND distinct_id IN (',
    '                  SELECT DISTINCT distinct_id',
    '                  FROM events',
    '                  WHERE project_id = {project_id:UUID}',
    `                    AND timestamp >= ${fromExpr}`,
    `                    AND timestamp <= ${toExpr}`,
    '                    AND event_name IN ({step_names:Array(String)})',
    '                )',
  ].join('\n') : `\n                AND event_name IN ({step_names:Array(String)})`;

  const sql = `
    WITH funnel_raw AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${buildWindowFunnelExpr(orderType, stepConditions)} AS max_step,
        ${stepArrayCols},
        toInt64(minIf(toUnixTimestamp64Milli(timestamp), ${stepConds[toStep]!})) AS last_step_prelim_ms${exclColumnsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= ${fromExpr}
        AND timestamp <= ${toExpr}${strictUserFilter}${cohortClause}${samplingClause}
      GROUP BY person_id
    ),
    ${seqStepCTEs.join(',\n    ')},
    funnel_per_user AS (
      SELECT
        person_id,
        max_step,
        ${stepMsCols}${exclAliasSQL}
      FROM ${lastSeqCTE}
    ),
    ${excludedUsersCTE}converted AS (
      SELECT
        (${toCol} - ${fromCol}) / 1000.0 AS duration_seconds
      FROM funnel_per_user
      WHERE max_step >= {to_step_num:UInt64}${exclAndCondition}
    )
    SELECT
      avgIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS avg_seconds,
      quantileIf(0.5)(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS median_seconds,
      toInt64(countIf(duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64})) AS sample_size,
      minIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS min_seconds,
      maxIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS max_seconds,
      groupArrayIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS durations
    FROM converted
  `;

  const queryResult = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await queryResult.json<TtcAggRow>();

  return parseTtcRows(rows, fromStep, toStep);
}

// ── Shared result-row types and parser ───────────────────────────────────────

interface TtcAggRow {
  avg_seconds: string | null;
  median_seconds: string | null;
  sample_size: string;
  min_seconds: string | null;
  max_seconds: string | null;
  durations: number[];
}

function parseTtcRows(rows: TtcAggRow[], fromStep: number, toStep: number): TimeToConvertResult {
  const row = rows[0];
  const sampleSize = Number(row?.sample_size ?? 0);

  if (sampleSize === 0) {
    return { from_step: fromStep, to_step: toStep, average_seconds: null, median_seconds: null, sample_size: 0, bins: [] };
  }

  const avgSeconds = row.avg_seconds != null ? Math.round(Number(row.avg_seconds)) : null;
  const medianSeconds = row.median_seconds != null ? Math.round(Number(row.median_seconds)) : null;
  const minVal = Number(row.min_seconds ?? 0);
  const maxVal = Number(row.max_seconds ?? 0);

  // When all converters took exactly the same time (range = 0), return a single
  // point bin instead of creating binCount empty bins spanning an arbitrary range.
  const range = maxVal - minVal;
  if (range === 0) {
    const pointSec = Math.round(minVal);
    const bins: TimeToConvertBin[] = [{ from_seconds: pointSec, to_seconds: pointSec + 1, count: sampleSize }];
    return { from_step: fromStep, to_step: toStep, average_seconds: avgSeconds, median_seconds: medianSeconds, sample_size: sampleSize, bins };
  }

  // Determine bin parameters.
  const binCount = Math.max(1, Math.min(MAX_BINS, Math.ceil(Math.cbrt(sampleSize))));
  const binWidth = Math.max(1, Math.ceil(range / binCount));

  // Build dense bin array by iterating durations with a for-loop.
  // Using a loop (not Math.min/max spread) avoids V8 stack overflow on large arrays.
  const binCountByIdx = new Map<number, number>();
  const durations: number[] = row.durations ?? [];
  for (const d of durations) {
    const idx = Math.max(0, Math.min(binCount - 1, Math.floor((d - minVal) / binWidth)));
    binCountByIdx.set(idx, (binCountByIdx.get(idx) ?? 0) + 1);
  }

  const bins: TimeToConvertBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const fromSec = Math.round(minVal + i * binWidth);
    const toSec = Math.round(minVal + (i + 1) * binWidth);
    bins.push({ from_seconds: fromSec, to_seconds: toSec, count: binCountByIdx.get(i) ?? 0 });
  }

  return { from_step: fromStep, to_step: toStep, average_seconds: avgSeconds, median_seconds: medianSeconds, sample_size: sampleSize, bins };
}

// ── Unordered TTC ────────────────────────────────────────────────────────────

/**
 * Builds and executes the TTC query for unordered funnels.
 *
 * Uses the same groupArrayIf + arrayExists anchor logic as funnel-unordered.sql.ts:
 *   - Collects all timestamps per step as arrays via groupArrayIf.
 *   - Tries every timestamp from every step array as a candidate anchor.
 *   - max_step = maximum steps coverable from any candidate anchor.
 *   - anchor_ms = first anchor (tried t_fromStep_arr first) that achieves full coverage.
 *
 * Duration = |t_{to_step}_first_in_window - anchor_ms|
 * This matches the corrected unordered funnel semantics: the duration is measured
 * from the anchor of the successful conversion window.
 */
async function buildUnorderedTtcSql(
  ch: ClickHouseClient,
  queryParams: TtcChQueryParams,
  stepConds: string[],
  exclColumns: string[],
  exclusions: NonNullable<TimeToConvertParams['exclusions']>,
  fromStep: number,
  toStep: number,
  cohortClause: string,
  samplingClause: string,
): Promise<TimeToConvertResult> {
  const N = stepConds.length;
  const winExpr = `toInt64({window:UInt64}) * 1000`;

  // Collect all timestamps per step as arrays.
  const groupArrayCols = stepConds.map(
    (cond, i) => `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS t${i}_arr`,
  ).join(',\n        ');

  // Exclusion array columns.
  const exclColsSQL = exclColumns.length > 0
    ? ',\n        ' + exclColumns.join(',\n        ')
    : '';

  // coverage(anchorVar) = number of steps covered by the given anchor.
  const coverageExpr = (anchorVar: string): string =>
    stepConds.map((_, j) =>
      `if(arrayExists(t${j} -> t${j} >= ${anchorVar} AND t${j} <= ${anchorVar} + ${winExpr}, t${j}_arr), 1, 0)`,
    ).join(' + ');

  // max_step: best coverage from any candidate anchor across all step arrays.
  const maxFromEachStep = stepConds.map((_, i) =>
    `arrayMax(a${i} -> toInt64(${coverageExpr(`a${i}`)}), t${i}_arr)`,
  );
  const maxStepExpr = maxFromEachStep.length === 1
    ? maxFromEachStep[0]!
    : `greatest(${maxFromEachStep.join(', ')})`;

  // anchor_ms: first anchor (tried fromStep first, then toStep, then rest) achieving full coverage.
  // This makes the TTC measurement start from the from-step when possible.
  const fullCovPred = (i: number): string =>
    `a${i} -> (${coverageExpr(`a${i}`)}) = ${N}`;
  // Build priority order: fromStep first, toStep second, rest in order.
  const orderedStepIndices = [
    fromStep,
    ...Array.from({ length: N }, (_, i) => i).filter((i) => i !== fromStep),
  ];
  const firsts = orderedStepIndices.map((i) =>
    `arrayFirst(${fullCovPred(i)}, t${i}_arr)`,
  );
  let anchorMsExpr: string;
  if (N === 1) {
    anchorMsExpr = `if(length(t0_arr) > 0, arrayMin(t0_arr), toInt64(0))`;
  } else {
    let expr = `toInt64(0)`;
    for (let k = firsts.length - 1; k >= 0; k--) {
      expr = `if(toInt64(${firsts[k]}) != 0, toInt64(${firsts[k]}), ${expr})`;
    }
    anchorMsExpr = expr;
  }

  // Pass-through exclusion aliases from step_times to anchor_per_user.
  const exclColAliases = exclColumns.map(col => col.split(' AS ')[1]!);
  const exclColsForward = exclColAliases.length > 0
    ? ',\n        ' + exclColAliases.join(',\n        ')
    : '';

  const anyStepNonEmpty = Array.from({ length: N }, (_, i) => `length(t${i}_arr) > 0`).join(' OR ');

  const excludedUsersCTE = exclusions.length > 0
    ? ',\n  ' + buildExcludedUsersCTE(exclusions)
    : '';

  const exclAndCondition = exclusions.length > 0
    ? '\n        AND person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  const fromExprU = funnelTsExpr('from', queryParams);
  const toExprU = funnelTsExpr('to', queryParams);

  const sql = `
    WITH step_times AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${groupArrayCols}${exclColsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= ${fromExprU}
        AND timestamp <= ${toExprU}
        AND event_name IN ({step_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id
    ),
    anchor_per_user AS (
      SELECT
        person_id,
        toInt64(${maxStepExpr}) AS max_step,
        toInt64(${anchorMsExpr}) AS anchor_ms${exclColsForward},
        ${Array.from({ length: N }, (_, i) => `t${i}_arr`).join(', ')}
      FROM step_times
      WHERE ${anyStepNonEmpty}
    ),
    funnel_per_user AS (
      SELECT
        person_id,
        max_step,
        anchor_ms,
        toInt64(if(
          notEmpty(arrayFilter(tf -> tf >= anchor_ms AND tf <= anchor_ms + ${winExpr}, t${fromStep}_arr)),
          arrayMin(arrayFilter(tf -> tf >= anchor_ms AND tf <= anchor_ms + ${winExpr}, t${fromStep}_arr)),
          toInt64(0)
        )) AS from_step_ms,
        toInt64(if(
          notEmpty(arrayFilter(tv -> tv >= anchor_ms AND tv <= anchor_ms + ${winExpr}, t${toStep}_arr)),
          arrayMin(arrayFilter(tv -> tv >= anchor_ms AND tv <= anchor_ms + ${winExpr}, t${toStep}_arr)),
          toInt64(0)
        )) AS to_step_ms${exclColsForward}
      FROM anchor_per_user
    )${excludedUsersCTE},
    converted AS (
      SELECT
        (to_step_ms - from_step_ms) / 1000.0 AS duration_seconds
      FROM funnel_per_user
      WHERE max_step >= {to_step_num:UInt64}
        AND to_step_ms >= from_step_ms
        AND from_step_ms > 0${exclAndCondition}
    )
    SELECT
      avgIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS avg_seconds,
      quantileIf(0.5)(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS median_seconds,
      toInt64(countIf(duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64})) AS sample_size,
      minIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS min_seconds,
      maxIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS max_seconds,
      groupArrayIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS durations
    FROM converted
  `;

  const queryResult = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await queryResult.json<TtcAggRow>();
  return parseTtcRows(rows, fromStep, toStep);
}
