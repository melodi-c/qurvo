import type { ClickHouseClient } from '@qurvo/clickhouse';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { buildCohortClause, RESOLVED_PERSON, toChTs } from '../../utils/clickhouse-helpers';
import type { TimeToConvertParams, TimeToConvertResult, TimeToConvertBin } from './funnel.types';
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
 * The single-query approach:
 *   funnel_per_user — per-person windowFunnel + timestamps (one full scan of events)
 *   converted       — filter to users who reached to_step within window
 *   final SELECT    — computes avg, median, min, max, count AND collects all
 *                     duration_seconds values in groupArray — all in one pass.
 *
 * Histogram binning is done in JS from the returned durations array:
 *   - bin_count and bin_width are computed from server-side min/max/count
 *   - a simple for-loop bins each duration (no Math.min/max spread, no V8 stack risk)
 *
 * This replaces the previous two-query approach (statsSql + binsSql), reducing
 * ClickHouse scans of the events table from 2 to 1.
 */

export async function queryFunnelTimeToConvert(
  ch: ClickHouseClient,
  params: TimeToConvertParams,
): Promise<TimeToConvertResult> {
  const { steps, project_id, from_step: fromStep, to_step: toStep } = params;
  const exclusions = params.exclusions ?? [];
  const numSteps = steps.length;
  const windowSeconds = resolveWindowSeconds(params);

  if (fromStep >= toStep) {
    throw new AppBadRequestException('from_step must be strictly less than to_step');
  }
  if (toStep >= numSteps) {
    throw new AppBadRequestException(`to_step ${toStep} out of range (max ${numSteps - 1})`);
  }

  validateExclusions(exclusions, numSteps);

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

  const cohortClause = buildCohortClause(params.cohort_filters, 'project_id', queryParams);

  const samplingClause = buildSamplingClause(params.sampling_factor, queryParams);

  // Build step conditions once and reuse
  const stepConds = steps.map((s, i) => buildStepCondition(s, i, queryParams));
  const stepConditions = stepConds.join(', ');

  // Per-step minIf timestamps (reuse cached step conditions)
  const stepTimestampCols = stepConds.map(
    (cond, i) => `minIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS step_${i}_ms`,
  ).join(',\n            ');

  const fromCol = `step_${fromStep}_ms`;
  const toCol = `step_${toStep}_ms`;

  // Build exclusion columns and CTE (same pattern as ordered funnel)
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams)
    : [];
  const exclColumnsSQL = exclColumns.length > 0
    ? ',\n            ' + exclColumns.join(',\n            ')
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
  // The converted CTE is referenced only once in the final SELECT, so ClickHouse
  // evaluates funnel_per_user (the events scan) exactly once.
  //
  // groupArray collects all valid duration_seconds values (up to sample_size floats).
  // Histogram binning is performed in JS using a simple loop:
  //   - bin_count = max(1, min(MAX_BINS, ceil(cbrt(sample_size)))) — same as before
  //   - bin_width = range == 0 ? 60 : max(1, ceil(range / bin_count))  — same as before
  //   - each duration is binned with: clamp(floor((d - min) / bin_width), 0, bin_count-1)
  // This avoids the V8 spread-argument stack overflow (no Math.min/max spread) because
  // min and max are returned from ClickHouse as scalar values, not derived from the array.
  const sql = `
    WITH funnel_per_user AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${buildWindowFunnelExpr('ordered', stepConditions)} AS max_step,
        ${stepTimestampCols}${exclColumnsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name IN ({step_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id
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
  const rows = await queryResult.json<{
    avg_seconds: string | null;
    median_seconds: string | null;
    sample_size: string;
    min_seconds: string | null;
    max_seconds: string | null;
    durations: number[];
  }>();

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
