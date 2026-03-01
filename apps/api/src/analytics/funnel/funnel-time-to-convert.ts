import type { ClickHouseClient } from '@qurvo/clickhouse';
import { compileExprToSql, CompilerContext } from '@qurvo/ch-query';
import { cohortFilter, cohortBounds } from '../query-helpers';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { TimeToConvertParams, TimeToConvertResult, TimeToConvertBin, FunnelOrderType } from './funnel.types';
import {
  RESOLVED_PERSON,
  toChTs,
  resolveWindowSeconds,
  buildStepCondition,
  buildSamplingClauseRaw,
  buildWindowFunnelExpr,
  buildAllEventNames,
  buildExclusionColumns,
  buildExcludedUsersCTERaw,
  buildUnorderedCoverageExprs,
  buildStrictUserFilter,
  validateExclusions,
  validateUnorderedSteps,
  funnelTsExprSql,
  compileExprsToSqlColumns,
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
 *   sample_pct         — sampling percentage 0-100 (UInt8), present only when sampling
 *   (step_N/filter params are embedded via namedParam in Expr AST)
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
 *   final SELECT    — computes avg, min, max, count AND collects all
 *                     duration_seconds values in groupArray — all in one pass.
 *                     Median is computed in TypeScript from the durations array
 *                     for exact results (traditional statistical median).
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

  validateExclusions(exclusions, numSteps, steps);

  if (orderType === 'unordered') {
    validateUnorderedSteps(steps);
  }

  const allEventNames = buildAllEventNames(steps, exclusions);

  const hasTz = !!(params.timezone && params.timezone !== 'UTC');
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
  if (hasTz) {queryParams.tz = params.timezone;}
  // Step event names are no longer injected here — buildStepCondition() uses namedParam()

  const ctx = new CompilerContext();
  const { dateTo, dateFrom } = cohortBounds(params);
  const cohortExpr = cohortFilter(params.cohort_filters, params.project_id, dateTo, dateFrom);
  const cohortClause = cohortExpr ? ' AND ' + compileExprToSql(cohortExpr, queryParams, ctx).sql : '';

  const samplingClause = buildSamplingClauseRaw(params.sampling_factor, queryParams);

  // Build step conditions as Expr, then compile to SQL strings for raw SQL embedding
  const stepCondExprs = steps.map((s, i) => buildStepCondition(s, i));
  const stepConds = stepCondExprs.map(expr => compileExprToSql(expr, queryParams, ctx).sql);

  // Build exclusion columns as Expr[], then compile to SQL strings
  const exclExprList = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps)
    : [];
  const exclColumnsSql = exclExprList.length > 0
    ? compileExprsToSqlColumns(exclExprList, queryParams, ctx)
    : [];

  if (orderType === 'unordered') {
    return buildUnorderedTtcSql(ch, queryParams, stepConds, exclColumnsSql, exclusions, fromStep, toStep, cohortClause, samplingClause, ctx);
  }

  // Compile windowFunnel Expr to SQL for raw CTE body
  const wfExprAst = buildWindowFunnelExpr(orderType, stepCondExprs);
  const wfExprSql = compileExprToSql(wfExprAst, queryParams, ctx).sql;

  const stepArrayCols = stepConds.map(
    (cond, i) => `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS step_${i}_arr`,
  ).join(',\n            ');

  const fromCol = `step_${fromStep}_ms`;
  const toCol = `step_${toStep}_ms`;

  // Aggregation expressions for funnel_raw (e.g. "groupArrayIf(...) AS excl_0_from_arr")
  const exclColumnsSQL = exclColumnsSql.length > 0
    ? ',\n            ' + exclColumnsSql.join(',\n            ')
    : '';
  // Pass-through aliases for funnel_per_user (e.g. "excl_0_from_arr")
  const exclColumnAliases = exclColumnsSql.map((expr) => {
    const match = /AS (\w+)$/.exec(expr.trim());
    return match ? match[1] : expr;
  });
  const exclAliasSQL = exclColumnAliases.length > 0
    ? ',\n      ' + exclColumnAliases.join(',\n      ')
    : '';
  const excludedUsersCTE = exclusions.length > 0
    ? buildExcludedUsersCTERaw(exclusions) + ',\n  '
    : '';
  // Extra AND condition appended to the WHERE clause in the `converted` CTE
  const exclAndCondition = exclusions.length > 0
    ? '\n        AND person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

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
      stepMsExpr =
        `if(\n          notEmpty(arrayFilter(t0 -> t0 <= last_step_prelim_ms AND last_step_prelim_ms - t0 <= ${winMsExpr} AND last_step_prelim_ms > 0, step_0_arr)),\n          toInt64(arrayMin(arrayFilter(t0 -> t0 <= last_step_prelim_ms AND last_step_prelim_ms - t0 <= ${winMsExpr} AND last_step_prelim_ms > 0, step_0_arr))),\n          toInt64(0)\n        ) AS step_0_ms`;
    } else {
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

  const fromExpr = funnelTsExprSql('from', queryParams, ctx);
  const toExpr = funnelTsExprSql('to', queryParams, ctx);

  const strictUserFilter = buildStrictUserFilter(fromExpr, toExpr, 'step_names', orderType);

  const sql = `
    WITH funnel_raw AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${wfExprSql} AS max_step,
        ${stepArrayCols},
        toInt64(minIf(toUnixTimestamp64Milli(timestamp), ${stepConds[toStep]})) AS last_step_prelim_ms${exclColumnsSQL}
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
      avgIf(duration_seconds, duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64}) AS avg_seconds,
      toInt64(countIf(duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64})) AS sample_size,
      minIf(duration_seconds, duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64}) AS min_seconds,
      maxIf(duration_seconds, duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64}) AS max_seconds,
      groupArrayIf(duration_seconds, duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64}) AS durations
    FROM converted
  `;

  const queryResult = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await queryResult.json<TtcAggRow>();

  return parseTtcRows(rows, fromStep, toStep);
}

// ── Shared result-row types and parser ───────────────────────────────────────

/** @internal Exported for unit testing only. */
export interface TtcAggRow {
  avg_seconds: string | null;
  sample_size: string;
  min_seconds: string | null;
  max_seconds: string | null;
  durations: number[];
}

/**
 * Compute the exact median from a sorted array of numbers.
 *
 * For even-length arrays, returns the average of the two middle values
 * (traditional statistical median). This is consistent with the histogram
 * bins derived from the same `durations` array.
 */
function exactMedian(values: number[]): number | null {
  if (values.length === 0) {return null;}
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @internal Exported for unit testing only. */
export function parseTtcRows(rows: TtcAggRow[], fromStep: number, toStep: number): TimeToConvertResult {
  const row = rows[0];
  const sampleSize = Number(row?.sample_size ?? 0);

  if (sampleSize === 0) {
    return { from_step: fromStep, to_step: toStep, average_seconds: null, median_seconds: null, sample_size: 0, bins: [] };
  }

  const avgSeconds = row.avg_seconds !== null && row.avg_seconds !== undefined ? Math.round(Number(row.avg_seconds)) : null;
  const durations: number[] = row.durations ?? [];
  const rawMedian = exactMedian(durations);
  const medianSeconds = rawMedian !== null && rawMedian !== undefined ? Math.round(rawMedian) : null;
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
  for (const d of durations) {
    const idx = Math.max(0, Math.min(binCount - 1, Math.floor((d - minVal) / binWidth)));
    binCountByIdx.set(idx, (binCountByIdx.get(idx) ?? 0) + 1);
  }

  const bins: TimeToConvertBin[] = [];
  const maxRounded = Math.round(maxVal);
  for (let i = 0; i < binCount; i++) {
    const fromSec = Math.round(minVal + i * binWidth);
    const toSec = i === binCount - 1
      ? maxRounded
      : Math.round(minVal + (i + 1) * binWidth);
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
  exclColumnsSql: string[],
  exclusions: NonNullable<TimeToConvertParams['exclusions']>,
  fromStep: number,
  toStep: number,
  cohortClause: string,
  samplingClause: string,
  ctx?: CompilerContext,
): Promise<TimeToConvertResult> {
  const N = stepConds.length;
  const winExpr = `toInt64({window:UInt64}) * 1000`;

  // Collect all timestamps per step as arrays.
  const groupArrayCols = stepConds.map(
    (cond, i) => `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS t${i}_arr`,
  ).join(',\n        ');

  // Exclusion array columns.
  const exclColsSQL = exclColumnsSql.length > 0
    ? ',\n        ' + exclColumnsSql.join(',\n        ')
    : '';

  // Coverage, max_step, anchor_ms — shared with funnel-unordered.sql.ts
  const { maxStepExpr, anchorMsExpr } =
    buildUnorderedCoverageExprs(N, winExpr, stepConds);

  // Pass-through exclusion aliases from step_times to anchor_per_user.
  const exclColAliases = exclColumnsSql.map(c => {
    const m = /AS (\w+)$/.exec(c.trim());
    return m ? m[1] : c;
  });
  const exclColsForward = exclColAliases.length > 0
    ? ',\n        ' + exclColAliases.join(',\n        ')
    : '';

  // Guard on step-0 (anchor step) only — users without step-0 cannot enter the funnel,
  // even if they have events for other steps. Using OR across all steps would include
  // users who skipped step-0, producing incorrect TTC sample sizes and durations.
  const anyStepNonEmpty = `length(t0_arr) > 0`;

  // anchorFilter=true: restrict exclusion checks to (f, t) pairs where f >= first_step_ms
  // (the anchor window). This prevents historical clean sessions outside the anchor window
  // from masking tainted conversions within it — same fix as funnel-unordered.sql.ts (issue #497).
  const excludedUsersCTE = exclusions.length > 0
    ? ',\n  ' + buildExcludedUsersCTERaw(exclusions, true)
    : '';

  const exclAndCondition = exclusions.length > 0
    ? '\n        AND person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  const fromExprU = funnelTsExprSql('from', queryParams, ctx);
  const toExprU = funnelTsExprSql('to', queryParams, ctx);

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
        anchor_ms AS first_step_ms,
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
      avgIf(duration_seconds, duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64}) AS avg_seconds,
      toInt64(countIf(duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64})) AS sample_size,
      minIf(duration_seconds, duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64}) AS min_seconds,
      maxIf(duration_seconds, duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64}) AS max_seconds,
      groupArrayIf(duration_seconds, duration_seconds >= 0 AND duration_seconds <= {window_seconds:Float64}) AS durations
    FROM converted
  `;

  const queryResult = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await queryResult.json<TtcAggRow>();
  return parseTtcRows(rows, fromStep, toStep);
}
