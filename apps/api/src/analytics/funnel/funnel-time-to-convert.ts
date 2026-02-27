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

  const queryParams: TtcChQueryParams = {
    project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    window: windowSeconds,
    num_steps: steps.length,
    all_event_names: allEventNames,
    step_names: allEventNames,
    to_step_num: toStep + 1,
    window_seconds: windowSeconds,
  };
  steps.forEach((s, i) => {
    const names = resolveStepEventNames(s);
    queryParams[`step_${i}`] = names[0];
    if (names.length > 1) {
      queryParams[`step_${i}_names`] = names;
    }
  });

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams, toChTs(params.date_to, true), toChTs(params.date_from));

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
  // Step 0 always uses the global minimum. For step i > 0 we derive the
  // "sequence-aware" timestamp in the step_timestamps CTE.
  const stepArrayCols = stepConds.map(
    (cond, i) => `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS step_${i}_arr`,
  ).join(',\n            ');

  // Build a chain of sequence-aware timestamp expressions.
  // step_0_ms = earliest occurrence of step 0 (no predecessor constraint).
  // step_i_ms = earliest occurrence of step i that is >= step_{i-1}_ms
  //             (mirrors what windowFunnel uses for the ordered sequence).
  //
  // Expressions are fully inlined (no alias references within the same SELECT level)
  // because ClickHouse does not guarantee left-to-right alias resolution in SELECT.
  // if(notEmpty(arr), arrayMin(arr), 0) avoids UInt64 overflow from arrayMin([]).
  //
  // To avoid re-computing the prev-step expression for each level, we build a map
  // of step index → its inline SQL expression (without the AS alias).
  const seqStepInlineExpr: string[] = [];
  for (let i = 0; i < numSteps; i++) {
    if (i === 0) {
      seqStepInlineExpr.push(`if(notEmpty(step_0_arr), arrayMin(step_0_arr), 0)`);
    } else {
      const prevExpr = seqStepInlineExpr[i - 1]!;
      // Use a unique lambda variable name per step to avoid shadowing in nested expressions.
      const lv = `t${i}`;
      seqStepInlineExpr.push(
        `if(notEmpty(arrayFilter(${lv} -> ${lv} >= (${prevExpr}), step_${i}_arr)),` +
        ` arrayMin(arrayFilter(${lv} -> ${lv} >= (${prevExpr}), step_${i}_arr)),` +
        ` 0)`,
      );
    }
  }
  const seqStepSQL = seqStepInlineExpr
    .map((expr, i) => `${expr} AS step_${i}_ms`)
    .join(',\n      ');

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

  // Single query: scan events once, compute both stats and raw durations.
  //
  // Two-level CTE structure:
  //   funnel_raw  — per-person windowFunnel + arrays of timestamps per step
  //                 (one full scan of events)
  //   funnel_per_user — derives sequence-aware step_i_ms from raw arrays:
  //                 step_0_ms = arrayMin(step_0_arr)
  //                 step_i_ms = first occurrence of step i that is >= step_{i-1}_ms
  //                 This matches the ordering that windowFunnel uses and prevents
  //                 earlier-ever occurrences (before step 0) from skewing the TTC.
  //   converted   — filter to users who completed to_step; compute duration
  //   final SELECT — aggregates stats + collects durations for histogram binning in JS
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
  const strictUserFilter = orderType === 'strict' ? [
    '',
    '                AND distinct_id IN (',
    '                  SELECT DISTINCT distinct_id',
    '                  FROM events',
    '                  WHERE project_id = {project_id:UUID}',
    '                    AND timestamp >= {from:DateTime64(3)}',
    '                    AND timestamp <= {to:DateTime64(3)}',
    '                    AND event_name IN ({step_names:Array(String)})',
    '                )',
  ].join('\n') : `\n                AND event_name IN ({step_names:Array(String)})`;

  const sql = `
    WITH funnel_raw AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${buildWindowFunnelExpr(orderType, stepConditions)} AS max_step,
        ${stepArrayCols}${exclColumnsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}${strictUserFilter}${cohortClause}${samplingClause}
      GROUP BY person_id
    ),
    funnel_per_user AS (
      SELECT
        person_id,
        max_step,
        ${seqStepSQL}${exclAliasSQL}
      FROM funnel_raw
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

  // Determine bin parameters (same formula as before).
  const binCount = Math.max(1, Math.min(MAX_BINS, Math.ceil(Math.cbrt(sampleSize))));
  const range = maxVal - minVal;
  const binWidth = range === 0 ? 60 : Math.max(1, Math.ceil(range / binCount));

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
 * Uses the same anchor-based minIf logic as the unordered main funnel:
 *   - t_i_ms = minIf(timestamp, stepCondition) per step
 *   - anchor_ms = least(t_0_ms, ..., t_n_ms)   (earliest qualifying step)
 *   - max_step  = count of steps where t_i_ms is within anchor + window
 *
 * Duration = |t_{to_step}_ms - t_{from_step}_ms|
 * This mirrors the unordered funnel's semantics: steps can complete in any
 * order, so TTC may be positive or negative depending on which step fired
 * first. We take abs() so that duration_seconds is always non-negative.
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
  const sentinel = 'toInt64(9007199254740992)';
  const numSteps = stepConds.length;

  // minIf per step: smallest timestamp matching the step condition (0 if no match)
  const minIfCols = stepConds.map(
    (cond, i) => `toInt64(minIf(toUnixTimestamp64Milli(timestamp), ${cond})) AS t${i}_ms`,
  ).join(',\n        ');

  // Exclusion array columns (same as ordered path)
  const exclColsSQL = exclColumns.length > 0
    ? ',\n        ' + exclColumns.join(',\n        ')
    : '';

  // anchor_ms = earliest non-zero step (same as funnel-unordered.sql)
  const anchorArgs = Array.from({ length: numSteps }, (_, i) => `if(t${i}_ms > 0, t${i}_ms, ${sentinel})`).join(', ');

  // max_step = count of steps that fired within the anchor window
  const stepCountParts = Array.from(
    { length: numSteps },
    (_, i) => `if(t${i}_ms > 0 AND t${i}_ms >= anchor_ms AND t${i}_ms <= anchor_ms + (toInt64({window:UInt64}) * 1000), 1, 0)`,
  ).join(' + ');

  // Pass-through exclusion aliases from step_times to funnel_per_user
  const exclColAliases = exclColumns.map(col => col.split(' AS ')[1]!);
  const exclColsForward = exclColAliases.length > 0
    ? ',\n        ' + exclColAliases.join(',\n        ')
    : '';

  const excludedUsersCTE = exclusions.length > 0
    ? ',\n  ' + buildExcludedUsersCTE(exclusions)
    : '';

  const exclAndCondition = exclusions.length > 0
    ? '\n        AND person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  // Duration = abs(t_{to}_ms - t_{from}_ms) / 1000.0
  // abs() ensures duration is non-negative regardless of which step fired first.
  const sql = `
    WITH step_times AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${minIfCols}${exclColsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name IN ({step_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id
    ),
    funnel_per_user AS (
      SELECT
        person_id,
        least(${anchorArgs}) AS anchor_ms,
        (${stepCountParts}) AS max_step,
        t${fromStep}_ms,
        t${toStep}_ms${exclColsForward}
      FROM step_times
      WHERE least(${anchorArgs}) < ${sentinel}
    )${excludedUsersCTE},
    converted AS (
      SELECT
        abs(t${toStep}_ms - t${fromStep}_ms) / 1000.0 AS duration_seconds
      FROM funnel_per_user
      WHERE max_step >= {to_step_num:UInt64}
        AND t${fromStep}_ms > 0
        AND t${toStep}_ms > 0${exclAndCondition}
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
