import type { ClickHouseClient } from '@qurvo/clickhouse';
import { buildCohortFilterClause, type CohortFilterInput } from '../cohorts/cohorts.query';
import { toChTs, RESOLVED_PERSON } from '../utils/clickhouse-helpers';
import { resolvePropertyExpr, buildPropertyFilterConditions, type PropertyFilter } from '../utils/property-filter';

export type StepFilter = PropertyFilter;

export interface FunnelStep {
  event_name: string;
  label: string;
  filters?: StepFilter[];
}

export interface FunnelStepResult {
  step: number;
  label: string;
  event_name: string;
  count: number;
  conversion_rate: number;
  drop_off: number;
  drop_off_rate: number;
  avg_time_to_convert_seconds: number | null;
}

export interface FunnelBreakdownStepResult extends FunnelStepResult {
  breakdown_value: string;
}

export type FunnelQueryResult =
  | { breakdown: false; steps: FunnelStepResult[] }
  | { breakdown: true; breakdown_property: string; steps: FunnelBreakdownStepResult[]; aggregate_steps: FunnelStepResult[] };

export interface FunnelQueryParams {
  project_id: string;
  steps: FunnelStep[];
  conversion_window_days: number;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  cohort_filters?: CohortFilterInput[];
}

/** Builds the windowFunnel condition for one step, injecting filter params into queryParams. */
function buildStepCondition(
  step: FunnelStep,
  idx: number,
  queryParams: Record<string, unknown>,
): string {
  const filterParts = buildPropertyFilterConditions(
    step.filters ?? [],
    `step_${idx}`,
    queryParams,
  );
  return [`event_name = {step_${idx}:String}`, ...filterParts].join(' AND ');
}

export async function queryFunnel(
  ch: ClickHouseClient,
  params: FunnelQueryParams,
): Promise<FunnelQueryResult> {
  const { steps, project_id } = params;
  const windowSeconds = params.conversion_window_days * 86400;
  const numSteps = steps.length;

  const queryParams: Record<string, unknown> = {
    project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    window: windowSeconds,
    num_steps: numSteps,
    step_names: steps.map((s) => s.event_name),
  };
  steps.forEach((s, i) => {
    queryParams[`step_${i}`] = s.event_name;
  });

  const stepConditions = steps.map((s, i) => buildStepCondition(s, i, queryParams)).join(', ');

  // Cohort filter clause
  const cohortClause = params.cohort_filters?.length
    ? ' AND ' + buildCohortFilterClause(params.cohort_filters, 'project_id', queryParams)
    : '';

  if (!params.breakdown_property) {
    // Non-breakdown funnel: count users per step + time-to-convert for full completions
    const sql = `
      WITH
        funnel_per_user AS (
          SELECT
            ${RESOLVED_PERSON} AS person_id,
            windowFunnel({window:UInt64})(toDateTime(timestamp), ${stepConditions}) AS max_step,
            minIf(toUnixTimestamp64Milli(timestamp), event_name = {step_0:String}) AS first_step_ms,
            maxIf(toUnixTimestamp64Milli(timestamp), event_name = {step_${numSteps - 1}:String}) AS last_step_ms
          FROM events FINAL
          WHERE
            project_id = {project_id:UUID}
            AND timestamp >= {from:DateTime64(3)}
            AND timestamp <= {to:DateTime64(3)}
            AND event_name IN ({step_names:Array(String)})${cohortClause}
          GROUP BY person_id
        )
      SELECT
        step_num,
        countIf(max_step >= step_num) AS entered,
        countIf(max_step >= step_num + 1) AS next_step,
        avgIf(
          (last_step_ms - first_step_ms) / 1000.0,
          max_step >= {num_steps:UInt64} AND last_step_ms > first_step_ms
        ) AS avg_time_seconds
      FROM funnel_per_user
      CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps
      GROUP BY step_num
      ORDER BY step_num
    `;

    const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await result.json<{
      step_num: string;
      entered: string;
      next_step: string;
      avg_time_seconds: string | null;
    }>();

    const firstCount = Number(rows[0]?.entered ?? 0);

    const stepResults: FunnelStepResult[] = rows.map((row) => {
      const stepIdx = Number(row.step_num) - 1;
      const entered = Number(row.entered);
      const nextStep = Number(row.next_step);
      const isLast = stepIdx === numSteps - 1;
      const converted = isLast ? 0 : nextStep;
      const dropOff = entered - converted;

      return {
        step: Number(row.step_num),
        label: steps[stepIdx]?.label ?? '',
        event_name: steps[stepIdx]?.event_name ?? '',
        count: entered,
        conversion_rate: firstCount > 0 ? Math.round((entered / firstCount) * 1000) / 10 : 0,
        drop_off: dropOff,
        drop_off_rate: entered > 0 ? Math.round((dropOff / entered) * 1000) / 10 : 0,
        avg_time_to_convert_seconds:
          !isLast && row.avg_time_seconds != null ? Math.round(Number(row.avg_time_seconds)) : null,
      };
    });

    return { breakdown: false, steps: stepResults };
  } else {
    // Breakdown funnel
    const breakdownExpr = resolvePropertyExpr(params.breakdown_property);
    const sql = `
      WITH
        funnel_per_user AS (
          SELECT
            ${RESOLVED_PERSON} AS person_id,
            anyIf(${breakdownExpr}, event_name = {step_0:String}) AS breakdown_value,
            windowFunnel({window:UInt64})(toDateTime(timestamp), ${stepConditions}) AS max_step
          FROM events FINAL
          WHERE
            project_id = {project_id:UUID}
            AND timestamp >= {from:DateTime64(3)}
            AND timestamp <= {to:DateTime64(3)}
            AND event_name IN ({step_names:Array(String)})${cohortClause}
          GROUP BY person_id
        )
      SELECT
        breakdown_value,
        step_num,
        countIf(max_step >= step_num) AS entered,
        countIf(max_step >= step_num + 1) AS next_step
      FROM funnel_per_user
      CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps
      GROUP BY breakdown_value, step_num
      ORDER BY breakdown_value, step_num
    `;

    const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await result.json<{
      breakdown_value: string;
      step_num: string;
      entered: string;
      next_step: string;
    }>();

    // Group by breakdown_value to compute per-group conversion rates
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const bv = row.breakdown_value || '(none)';
      if (!grouped.has(bv)) grouped.set(bv, []);
      grouped.get(bv)!.push(row);
    }

    const stepResults: FunnelBreakdownStepResult[] = [];
    for (const [bv, bvRows] of grouped) {
      const firstCount = Number(bvRows[0]?.entered ?? 0);
      for (const row of bvRows) {
        const stepIdx = Number(row.step_num) - 1;
        const entered = Number(row.entered);
        const nextStep = Number(row.next_step);
        const isLast = stepIdx === numSteps - 1;
        const converted = isLast ? 0 : nextStep;
        const dropOff = entered - converted;

        stepResults.push({
          step: Number(row.step_num),
          label: steps[stepIdx]?.label ?? '',
          event_name: steps[stepIdx]?.event_name ?? '',
          count: entered,
          conversion_rate: firstCount > 0 ? Math.round((entered / firstCount) * 1000) / 10 : 0,
          drop_off: dropOff,
          drop_off_rate: entered > 0 ? Math.round((dropOff / entered) * 1000) / 10 : 0,
          avg_time_to_convert_seconds: null,
          breakdown_value: bv,
        });
      }
    }

    // Aggregate totals per step across all breakdown groups
    const stepTotalsMap = new Map<number, number>();
    for (const r of stepResults) {
      stepTotalsMap.set(r.step, (stepTotalsMap.get(r.step) ?? 0) + r.count);
    }
    const stepNumsSorted = [...stepTotalsMap.keys()].sort((a, b) => a - b);
    const step1Total = stepTotalsMap.get(stepNumsSorted[0]) ?? 0;

    const aggregate_steps: FunnelStepResult[] = stepNumsSorted.map((sn, idx) => {
      const total = stepTotalsMap.get(sn) ?? 0;
      const isFirst = idx === 0;
      const isLast = idx === stepNumsSorted.length - 1;
      const prevTotal = isFirst ? total : (stepTotalsMap.get(stepNumsSorted[idx - 1]) ?? total);
      const dropOff = isFirst || isLast ? 0 : prevTotal - total;
      const dropOffRate = !isFirst && !isLast && prevTotal > 0
        ? Math.round((dropOff / prevTotal) * 1000) / 10
        : 0;
      return {
        step: sn,
        label: steps[idx]?.label ?? '',
        event_name: steps[idx]?.event_name ?? '',
        count: total,
        conversion_rate: step1Total > 0 ? Math.round((total / step1Total) * 1000) / 10 : 0,
        drop_off: dropOff,
        drop_off_rate: dropOffRate,
        avg_time_to_convert_seconds: null,
      };
    });

    return { breakdown: true, breakdown_property: params.breakdown_property, steps: stepResults, aggregate_steps };
  }
}
