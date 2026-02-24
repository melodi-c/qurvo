import type { ClickHouseClient } from '@qurvo/clickhouse';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import { buildCohortClause } from '../../utils/clickhouse-helpers';
import { RESOLVED_PERSON, toChTs } from '../../utils/clickhouse-helpers';
import type { TimeToConvertParams, TimeToConvertResult, TimeToConvertBin } from './funnel.types';
import {
  resolveWindowSeconds,
  resolveStepEventNames,
  buildStepCondition,
  buildSamplingClause,
  buildWindowFunnelExpr,
} from './funnel-sql-shared';

export async function queryFunnelTimeToConvert(
  ch: ClickHouseClient,
  params: TimeToConvertParams,
): Promise<TimeToConvertResult> {
  const { steps, project_id, from_step: fromStep, to_step: toStep } = params;
  const numSteps = steps.length;
  const windowSeconds = resolveWindowSeconds(params);

  if (fromStep >= toStep) {
    throw new AppBadRequestException('from_step must be strictly less than to_step');
  }
  if (toStep >= numSteps) {
    throw new AppBadRequestException(`to_step ${toStep} out of range (max ${numSteps - 1})`);
  }

  const queryParams: Record<string, unknown> = {
    project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    window: windowSeconds,
    step_names: steps.flatMap((s) => resolveStepEventNames(s)),
    to_step_num: toStep + 1,
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

  const sql = `
    SELECT
      avg_seconds,
      median_seconds,
      toInt64(sample_size) AS sample_size,
      timings
    FROM (
      SELECT
        avgIf(duration_seconds, duration_seconds > 0) AS avg_seconds,
        quantileIf(0.5)(duration_seconds, duration_seconds > 0) AS median_seconds,
        countIf(duration_seconds > 0) AS sample_size,
        groupArrayIf(duration_seconds, duration_seconds > 0) AS timings
      FROM (
        SELECT
          (${toCol} - ${fromCol}) / 1000.0 AS duration_seconds
        FROM (
          SELECT
            ${RESOLVED_PERSON} AS person_id,
            ${buildWindowFunnelExpr('ordered', stepConditions)} AS max_step,
            ${stepTimestampCols}
          FROM events FINAL
          WHERE
            project_id = {project_id:UUID}
            AND timestamp >= {from:DateTime64(3)}
            AND timestamp <= {to:DateTime64(3)}
            AND event_name IN ({step_names:Array(String)})${cohortClause}${samplingClause}
          GROUP BY person_id
        )
        WHERE max_step >= {to_step_num:UInt64}
      )
    )
  `;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<{
    avg_seconds: string | null;
    median_seconds: string | null;
    sample_size: string;
    timings: number[];
  }>();

  const row = rows[0];
  const sampleSize = Number(row?.sample_size ?? 0);

  if (sampleSize === 0 || !row?.timings?.length) {
    return { from_step: fromStep, to_step: toStep, average_seconds: null, median_seconds: null, sample_size: 0, bins: [] };
  }

  const timings = row.timings.filter((t: number) => t > 0 && t <= windowSeconds);
  const avgSeconds = row.avg_seconds != null ? Math.round(Number(row.avg_seconds)) : null;
  const medianSeconds = row.median_seconds != null ? Math.round(Number(row.median_seconds)) : null;

  const binCount = Math.max(1, Math.min(60, Math.ceil(Math.cbrt(timings.length))));
  const minVal = Math.min(...timings);
  const maxVal = Math.max(...timings);
  const range = maxVal - minVal;
  const binWidth = range === 0 ? 60 : Math.max(1, Math.ceil(range / binCount));

  const bins: TimeToConvertBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const fromSec = Math.round(minVal + i * binWidth);
    const toSec = Math.round(minVal + (i + 1) * binWidth);
    const isLast = i === binCount - 1;
    const count = timings.filter((t: number) => t >= fromSec && (isLast ? t <= toSec : t < toSec)).length;
    bins.push({ from_seconds: fromSec, to_seconds: toSec, count });
  }

  return { from_step: fromStep, to_step: toStep, average_seconds: avgSeconds, median_seconds: medianSeconds, sample_size: timings.length, bins };
}
