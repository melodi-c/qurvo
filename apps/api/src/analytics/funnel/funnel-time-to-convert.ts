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
 * Compute histogram bins entirely in ClickHouse, avoiding the V8 stack overflow
 * that occurs when spreading large arrays into Math.min / Math.max.
 *
 * The approach:
 *   1. One CTE computes per-person duration_seconds.
 *   2. A second CTE calculates min, max, sample_size, avg, median — all server-side.
 *   3. The outer query groups converted users into bins using floor arithmetic,
 *      so no timing array is ever transferred to Node.js.
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

  // Phase 1: fetch aggregate stats (avg, median, min, max, count) without pulling
  // every individual timing into Node.js. This avoids the V8 spread-argument stack
  // overflow that occurs for Math.min(...array) / Math.max(...array) when the array
  // exceeds ~100k elements.
  const statsSql = `
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
      maxIf(duration_seconds, duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}) AS max_seconds
    FROM converted
  `;

  const statsResult = await ch.query({ query: statsSql, query_params: queryParams, format: 'JSONEachRow' });
  const statsRows = await statsResult.json<{
    avg_seconds: string | null;
    median_seconds: string | null;
    sample_size: string;
    min_seconds: string | null;
    max_seconds: string | null;
  }>();

  const statsRow = statsRows[0];
  const sampleSize = Number(statsRow?.sample_size ?? 0);

  if (sampleSize === 0) {
    return { from_step: fromStep, to_step: toStep, average_seconds: null, median_seconds: null, sample_size: 0, bins: [] };
  }

  const avgSeconds = statsRow.avg_seconds != null ? Math.round(Number(statsRow.avg_seconds)) : null;
  const medianSeconds = statsRow.median_seconds != null ? Math.round(Number(statsRow.median_seconds)) : null;
  const minVal = Number(statsRow.min_seconds ?? 0);
  const maxVal = Number(statsRow.max_seconds ?? 0);

  // Determine bin parameters (same formula as before, now computed from server-side min/max).
  const binCount = Math.max(1, Math.min(MAX_BINS, Math.ceil(Math.cbrt(sampleSize))));
  const range = maxVal - minVal;
  const binWidth = range === 0 ? 60 : Math.max(1, Math.ceil(range / binCount));

  // Phase 2: compute histogram bins entirely in ClickHouse — O(n) server-side scan,
  // zero per-timing data transferred to Node.js, no in-memory O(n × binCount) filtering.
  const binsSql = `
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
      toInt64(bin_idx) AS bin_idx,
      toInt64(count()) AS bin_count
    FROM (
      SELECT
        greatest(0, least(
          toInt64(${binCount - 1}),
          toInt64(floor((duration_seconds - ${minVal}) / ${binWidth}))
        )) AS bin_idx
      FROM converted
      WHERE duration_seconds > 0 AND duration_seconds <= {window_seconds:Float64}
    )
    GROUP BY bin_idx
    ORDER BY bin_idx
  `;

  const binsResult = await ch.query({ query: binsSql, query_params: queryParams, format: 'JSONEachRow' });
  const binsRows = await binsResult.json<{ bin_idx: string; bin_count: string }>();

  // Build dense bin array (fill gaps with count=0).
  const binCountByIdx = new Map<number, number>();
  for (const r of binsRows) {
    binCountByIdx.set(Number(r.bin_idx), Number(r.bin_count));
  }

  const bins: TimeToConvertBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const fromSec = Math.round(minVal + i * binWidth);
    const toSec = Math.round(minVal + (i + 1) * binWidth);
    bins.push({ from_seconds: fromSec, to_seconds: toSec, count: binCountByIdx.get(i) ?? 0 });
  }

  return { from_step: fromStep, to_step: toStep, average_seconds: avgSeconds, median_seconds: medianSeconds, sample_size: sampleSize, bins };
}
