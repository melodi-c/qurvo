import type { ClickHouseClient } from '@qurvo/clickhouse';
import { BadRequestException } from '@nestjs/common';
import { buildCohortFilterClause, type CohortFilterInput } from '../cohorts/cohorts.query';
import { toChTs, RESOLVED_PERSON } from '../utils/clickhouse-helpers';
import { resolvePropertyExpr, buildPropertyFilterConditions, type PropertyFilter } from '../utils/property-filter';

// ── Types ────────────────────────────────────────────────────────────────────

export type StepFilter = PropertyFilter;
export type FunnelOrderType = 'ordered' | 'strict' | 'unordered';

export interface FunnelStep {
  event_name: string;
  event_names?: string[];
  label: string;
  filters?: StepFilter[];
}

export interface FunnelExclusion {
  event_name: string;
  funnel_from_step: number;
  funnel_to_step: number;
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
  | { breakdown: false; steps: FunnelStepResult[]; sampling_factor?: number }
  | { breakdown: true; breakdown_property: string; steps: FunnelBreakdownStepResult[]; aggregate_steps: FunnelStepResult[]; sampling_factor?: number };

export interface FunnelQueryParams {
  project_id: string;
  steps: FunnelStep[];
  conversion_window_days: number;
  conversion_window_value?: number;
  conversion_window_unit?: string;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  breakdown_cohort_ids?: { cohort_id: string; name: string; is_static: boolean }[];
  cohort_filters?: CohortFilterInput[];
  funnel_order_type?: FunnelOrderType;
  exclusions?: FunnelExclusion[];
  sampling_factor?: number;
}

export interface TimeToConvertBin {
  from_seconds: number;
  to_seconds: number;
  count: number;
}

export interface TimeToConvertResult {
  from_step: number;
  to_step: number;
  average_seconds: number | null;
  median_seconds: number | null;
  sample_size: number;
  bins: TimeToConvertBin[];
}

export interface TimeToConvertParams {
  project_id: string;
  steps: FunnelStep[];
  conversion_window_days: number;
  conversion_window_value?: number;
  conversion_window_unit?: string;
  date_from: string;
  date_to: string;
  from_step: number;
  to_step: number;
  cohort_filters?: CohortFilterInput[];
  sampling_factor?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const UNIT_TO_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000, // 30 days
};

function resolveWindowSeconds(params: { conversion_window_days: number; conversion_window_value?: number; conversion_window_unit?: string }): number {
  if (params.conversion_window_value != null && params.conversion_window_unit) {
    const multiplier = UNIT_TO_SECONDS[params.conversion_window_unit] ?? 86400;
    return params.conversion_window_value * multiplier;
  }
  return params.conversion_window_days * 86400;
}

/** Returns all event names for a step (supports OR-logic via event_names). */
function resolveStepEventNames(step: FunnelStep): string[] {
  if (step.event_names?.length) return step.event_names;
  return [step.event_name];
}

/** Builds the windowFunnel condition for one step, injecting filter params into queryParams. */
export function buildStepCondition(
  step: FunnelStep,
  idx: number,
  queryParams: Record<string, unknown>,
): string {
  const filterParts = buildPropertyFilterConditions(
    step.filters ?? [],
    `step_${idx}`,
    queryParams,
  );
  const names = resolveStepEventNames(step);
  const eventCond = names.length === 1
    ? `event_name = {step_${idx}:String}`
    : `event_name IN ({step_${idx}_names:Array(String)})`;
  return [eventCond, ...filterParts].join(' AND ');
}

function buildAllEventNames(steps: FunnelStep[], exclusions: FunnelExclusion[] = []): string[] {
  const names = new Set<string>();
  for (const s of steps) {
    for (const n of resolveStepEventNames(s)) names.add(n);
  }
  for (const e of exclusions) names.add(e.event_name);
  return Array.from(names);
}

/** WHERE-based sampling: deterministic per distinct_id, no SAMPLE BY needed on table. */
function buildSamplingClause(samplingFactor: number | undefined, queryParams: Record<string, unknown>): string {
  if (!samplingFactor || samplingFactor >= 1) return '';
  const pct = Math.round(samplingFactor * 100);
  queryParams.sample_pct = pct;
  return '\n                AND sipHash64(distinct_id) % 100 < {sample_pct:UInt8}';
}

function buildWindowFunnelExpr(orderType: FunnelOrderType, stepConditions: string): string {
  if (orderType === 'strict') {
    return `windowFunnel({window:UInt64}, 'strict_order')(toDateTime(timestamp), ${stepConditions})`;
  }
  return `windowFunnel({window:UInt64})(toDateTime(timestamp), ${stepConditions})`;
}

// ── Exclusion helpers ────────────────────────────────────────────────────────

function validateExclusions(exclusions: FunnelExclusion[], numSteps: number): void {
  for (const excl of exclusions) {
    if (excl.funnel_from_step >= excl.funnel_to_step) {
      throw new BadRequestException(
        `Exclusion "${excl.event_name}": funnel_from_step must be < funnel_to_step`,
      );
    }
    if (excl.funnel_to_step >= numSteps) {
      throw new BadRequestException(
        `Exclusion "${excl.event_name}": funnel_to_step ${excl.funnel_to_step} out of range (max ${numSteps - 1})`,
      );
    }
  }
}

function buildExclusionColumns(
  exclusions: FunnelExclusion[],
  steps: FunnelStep[],
  queryParams: Record<string, unknown>,
): string[] {
  const lines: string[] = [];
  for (const [i, excl] of exclusions.entries()) {
    queryParams[`excl_${i}_name`] = excl.event_name;
    queryParams[`excl_${i}_from_step_name`] = steps[excl.funnel_from_step]!.event_name;
    queryParams[`excl_${i}_to_step_name`] = steps[excl.funnel_to_step]!.event_name;

    lines.push(
      `minIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_name:String}) AS excl_${i}_ts`,
      `maxIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_from_step_name:String}) AS excl_${i}_from_ts`,
      `minIf(toUnixTimestamp64Milli(timestamp), event_name = {excl_${i}_to_step_name:String}) AS excl_${i}_to_ts`,
    );
  }
  return lines;
}

function buildExcludedUsersCTE(exclusions: FunnelExclusion[]): string {
  const conditions = exclusions.map(
    (_, i) =>
      `(excl_${i}_ts > 0 AND excl_${i}_from_ts > 0 AND excl_${i}_to_ts > 0 ` +
      `AND excl_${i}_ts > excl_${i}_from_ts AND excl_${i}_to_ts > excl_${i}_ts)`,
  );
  return `excluded_users AS (
    SELECT person_id
    FROM funnel_per_user
    WHERE ${conditions.join('\n      OR ')}
  )`;
}

// ── Unordered funnel CTE builder ─────────────────────────────────────────────

function buildUnorderedCTE(
  steps: FunnelStep[],
  queryParams: Record<string, unknown>,
  cohortClause: string,
  breakdownExpr?: string,
  samplingClause: string = '',
): string {
  const sentinel = 'toInt64(9007199254740992)';

  const minIfCols = steps.map((s, i) => {
    const cond = buildStepCondition(s, i, queryParams);
    return `minIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS t${i}_ms`;
  }).join(',\n        ');

  const breakdownCol = breakdownExpr
    ? `,\n        anyIf(${breakdownExpr}, ${buildStepCondition(steps[0], 0, queryParams)}) AS breakdown_value`
    : '';

  const anchorArgs = steps.map((_, i) => `if(t${i}_ms > 0, t${i}_ms, ${sentinel})`).join(', ');

  const stepCountParts = steps.map(
    (_, i) => `if(t${i}_ms > 0 AND t${i}_ms >= anchor_ms AND t${i}_ms <= anchor_ms + ({window:UInt64} * 1000), 1, 0)`,
  ).join(' + ');

  const greatestArgs = steps.map(
    (_, i) => `if(t${i}_ms > 0 AND t${i}_ms >= anchor_ms AND t${i}_ms <= anchor_ms + ({window:UInt64} * 1000), t${i}_ms, toInt64(0))`,
  ).join(', ');

  const breakdownForward = breakdownExpr ? ',\n        breakdown_value' : '';

  return `step_times AS (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        ${minIfCols}${breakdownCol}
      FROM events FINAL
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
        AND event_name IN ({all_event_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id
    ),
    funnel_per_user AS (
      SELECT
        person_id,
        least(${anchorArgs}) AS anchor_ms,
        (${stepCountParts}) AS max_step,
        least(${anchorArgs}) AS first_step_ms,
        greatest(${greatestArgs}) AS last_step_ms${breakdownForward}
      FROM step_times
      WHERE least(${anchorArgs}) < ${sentinel}
    )`;
}

// ── Step result computation ──────────────────────────────────────────────────

function computeStepResults(
  rows: { step_num: string; entered: string; next_step: string; avg_time_seconds?: string | null }[],
  steps: FunnelStep[],
  numSteps: number,
): FunnelStepResult[] {
  const firstCount = Number(rows[0]?.entered ?? 0);
  return rows.map((row) => {
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
}

function computeAggregateSteps(allBreakdownSteps: FunnelBreakdownStepResult[], steps: FunnelStep[]): FunnelStepResult[] {
  const stepTotals = new Map<number, number>();
  for (const r of allBreakdownSteps) {
    stepTotals.set(r.step, (stepTotals.get(r.step) ?? 0) + r.count);
  }
  const stepNums = [...stepTotals.keys()].sort((a, b) => a - b);
  const step1Total = stepTotals.get(stepNums[0]) ?? 0;
  return stepNums.map((sn, idx) => {
    const total = stepTotals.get(sn) ?? 0;
    const isFirst = idx === 0;
    const isLast = idx === stepNums.length - 1;
    const prevTotal = isFirst ? total : (stepTotals.get(stepNums[idx - 1]) ?? total);
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
}

// ── Main funnel query ────────────────────────────────────────────────────────

export async function queryFunnel(
  ch: ClickHouseClient,
  params: FunnelQueryParams,
): Promise<FunnelQueryResult> {
  const { steps, project_id } = params;
  const orderType = params.funnel_order_type ?? 'ordered';
  const exclusions = params.exclusions ?? [];
  const windowSeconds = resolveWindowSeconds(params);
  const numSteps = steps.length;

  validateExclusions(exclusions, numSteps);

  const allEventNames = buildAllEventNames(steps, exclusions);
  const queryParams: Record<string, unknown> = {
    project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    window: windowSeconds,
    num_steps: numSteps,
    all_event_names: allEventNames,
  };
  steps.forEach((s, i) => {
    const names = resolveStepEventNames(s);
    queryParams[`step_${i}`] = names[0]; // backward compat for single-event condition
    if (names.length > 1) {
      queryParams[`step_${i}_names`] = names;
    }
  });

  const stepConditions = steps.map((s, i) => buildStepCondition(s, i, queryParams)).join(', ');

  const cohortClause = params.cohort_filters?.length
    ? ' AND ' + buildCohortFilterClause(params.cohort_filters, 'project_id', queryParams)
    : '';

  // strict mode needs ALL events visible to windowFunnel('strict_order')
  const eventNameFilter = orderType === 'strict'
    ? ''
    : '\n                AND event_name IN ({all_event_names:Array(String)})';

  // Exclusion SQL fragments
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams)
    : [];
  const exclColumnsSQL = exclColumns.length > 0 ? ',\n            ' + exclColumns.join(',\n            ') : '';
  const exclCTE = exclusions.length > 0 ? ',\n      ' + buildExcludedUsersCTE(exclusions) : '';
  const exclFilter = exclusions.length > 0
    ? '\n      WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
    : '';

  // Sampling clause
  const samplingClause = buildSamplingClause(params.sampling_factor, queryParams);

  // ── Cohort breakdown ────────────────────────────────────────────────────
  if (params.breakdown_cohort_ids?.length) {
    const cohortBreakdowns = params.breakdown_cohort_ids;
    const allBreakdownSteps: FunnelBreakdownStepResult[] = [];

    for (const cb of cohortBreakdowns) {
      const cbParamKey = `cohort_bd_${cb.cohort_id.replace(/-/g, '')}`;
      const cbQueryParams = { ...queryParams, [cbParamKey]: cb.cohort_id };
      const table = cb.is_static ? 'person_static_cohort' : 'cohort_members';
      const cohortFilter = ` AND ${RESOLVED_PERSON} IN (
        SELECT person_id FROM ${table} FINAL
        WHERE cohort_id = {${cbParamKey}:UUID} AND project_id = {project_id:UUID}
      )`;

      // Rebuild exclusion columns for this cohort's queryParams
      const cbExclColumns = exclusions.length > 0
        ? buildExclusionColumns(exclusions, steps, cbQueryParams)
        : [];
      const cbExclColumnsSQL = cbExclColumns.length > 0 ? ',\n              ' + cbExclColumns.join(',\n              ') : '';

      let sql: string;
      if (orderType === 'unordered') {
        cbQueryParams.all_event_names = allEventNames;
        const cte = buildUnorderedCTE(steps, cbQueryParams, `${cohortClause}${cohortFilter}`, undefined, samplingClause);
        sql = `
          WITH ${cte}
          SELECT step_num, countIf(max_step >= step_num) AS entered, countIf(max_step >= step_num + 1) AS next_step
          FROM funnel_per_user
          CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps
          GROUP BY step_num ORDER BY step_num`;
      } else {
        const wfExpr = buildWindowFunnelExpr(orderType, stepConditions);
        const cbExclCTE = exclusions.length > 0 ? ',\n        ' + buildExcludedUsersCTE(exclusions) : '';
        const cbExclFilter = exclusions.length > 0
          ? '\n        WHERE person_id NOT IN (SELECT person_id FROM excluded_users)'
          : '';

        sql = `
          WITH
            funnel_per_user AS (
              SELECT
                ${RESOLVED_PERSON} AS person_id,
                ${wfExpr} AS max_step${cbExclColumnsSQL}
              FROM events FINAL
              WHERE
                project_id = {project_id:UUID}
                AND timestamp >= {from:DateTime64(3)}
                AND timestamp <= {to:DateTime64(3)}${eventNameFilter}${cohortClause}${cohortFilter}${samplingClause}
              GROUP BY person_id
            )${cbExclCTE}
          SELECT
            step_num,
            countIf(max_step >= step_num) AS entered,
            countIf(max_step >= step_num + 1) AS next_step
          FROM funnel_per_user
          CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${cbExclFilter}
          GROUP BY step_num
          ORDER BY step_num`;
      }

      const result = await ch.query({ query: sql, query_params: cbQueryParams, format: 'JSONEachRow' });
      const rows = await result.json<{ step_num: string; entered: string; next_step: string }>();

      const firstCount = Number(rows[0]?.entered ?? 0);
      for (const row of rows) {
        const stepIdx = Number(row.step_num) - 1;
        const entered = Number(row.entered);
        const nextStep = Number(row.next_step);
        const isLast = stepIdx === numSteps - 1;
        const converted = isLast ? 0 : nextStep;
        const dropOff = entered - converted;
        allBreakdownSteps.push({
          step: Number(row.step_num),
          label: steps[stepIdx]?.label ?? '',
          event_name: steps[stepIdx]?.event_name ?? '',
          count: entered,
          conversion_rate: firstCount > 0 ? Math.round((entered / firstCount) * 1000) / 10 : 0,
          drop_off: dropOff,
          drop_off_rate: entered > 0 ? Math.round((dropOff / entered) * 1000) / 10 : 0,
          avg_time_to_convert_seconds: null,
          breakdown_value: cb.name,
        });
      }
    }

    return {
      breakdown: true,
      breakdown_property: '$cohort',
      steps: allBreakdownSteps,
      aggregate_steps: computeAggregateSteps(allBreakdownSteps, steps),
      ...(params.sampling_factor && params.sampling_factor < 1 ? { sampling_factor: params.sampling_factor } : {}),
    };
  }

  // ── Non-breakdown funnel ────────────────────────────────────────────────
  if (!params.breakdown_property) {
    let sql: string;
    if (orderType === 'unordered') {
      const cte = buildUnorderedCTE(steps, queryParams, cohortClause, undefined, samplingClause);
      sql = `
        WITH ${cte}${exclCTE}
        SELECT
          step_num,
          countIf(max_step >= step_num) AS entered,
          countIf(max_step >= step_num + 1) AS next_step,
          avgIf(
            (last_step_ms - first_step_ms) / 1000.0,
            max_step >= {num_steps:UInt64} AND last_step_ms > first_step_ms
          ) AS avg_time_seconds
        FROM funnel_per_user
        CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${exclFilter}
        GROUP BY step_num
        ORDER BY step_num`;
    } else {
      const wfExpr = buildWindowFunnelExpr(orderType, stepConditions);
      sql = `
        WITH
          funnel_per_user AS (
            SELECT
              ${RESOLVED_PERSON} AS person_id,
              ${wfExpr} AS max_step,
              minIf(toUnixTimestamp64Milli(timestamp), event_name = {step_0:String}) AS first_step_ms,
              maxIf(toUnixTimestamp64Milli(timestamp), event_name = {step_${numSteps - 1}:String}) AS last_step_ms${exclColumnsSQL}
            FROM events FINAL
            WHERE
              project_id = {project_id:UUID}
              AND timestamp >= {from:DateTime64(3)}
              AND timestamp <= {to:DateTime64(3)}${eventNameFilter}${cohortClause}${samplingClause}
            GROUP BY person_id
          )${exclCTE}
        SELECT
          step_num,
          countIf(max_step >= step_num) AS entered,
          countIf(max_step >= step_num + 1) AS next_step,
          avgIf(
            (last_step_ms - first_step_ms) / 1000.0,
            max_step >= {num_steps:UInt64} AND last_step_ms > first_step_ms
          ) AS avg_time_seconds
        FROM funnel_per_user
        CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${exclFilter}
        GROUP BY step_num
        ORDER BY step_num`;
    }

    const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await result.json<{
      step_num: string;
      entered: string;
      next_step: string;
      avg_time_seconds: string | null;
    }>();

    return {
      breakdown: false,
      steps: computeStepResults(rows, steps, numSteps),
      ...(params.sampling_factor && params.sampling_factor < 1 ? { sampling_factor: params.sampling_factor } : {}),
    };
  }

  // ── Property breakdown funnel ───────────────────────────────────────────
  const breakdownExpr = resolvePropertyExpr(params.breakdown_property);
  let sql: string;
  if (orderType === 'unordered') {
    const cte = buildUnorderedCTE(steps, queryParams, cohortClause, breakdownExpr, samplingClause);
    sql = `
      WITH ${cte}${exclCTE}
      SELECT
        breakdown_value,
        step_num,
        countIf(max_step >= step_num) AS entered,
        countIf(max_step >= step_num + 1) AS next_step
      FROM funnel_per_user
      CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${exclFilter}
      GROUP BY breakdown_value, step_num
      ORDER BY breakdown_value, step_num`;
  } else {
    const wfExpr = buildWindowFunnelExpr(orderType, stepConditions);
    sql = `
      WITH
        funnel_per_user AS (
          SELECT
            ${RESOLVED_PERSON} AS person_id,
            anyIf(${breakdownExpr}, event_name = {step_0:String}) AS breakdown_value,
            ${wfExpr} AS max_step${exclColumnsSQL}
          FROM events FINAL
          WHERE
            project_id = {project_id:UUID}
            AND timestamp >= {from:DateTime64(3)}
            AND timestamp <= {to:DateTime64(3)}${eventNameFilter}${cohortClause}${samplingClause}
          GROUP BY person_id
        )${exclCTE}
      SELECT
        breakdown_value,
        step_num,
        countIf(max_step >= step_num) AS entered,
        countIf(max_step >= step_num + 1) AS next_step
      FROM funnel_per_user
      CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${exclFilter}
      GROUP BY breakdown_value, step_num
      ORDER BY breakdown_value, step_num`;
  }

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<{
    breakdown_value: string;
    step_num: string;
    entered: string;
    next_step: string;
  }>();

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

  return {
    breakdown: true,
    breakdown_property: params.breakdown_property,
    steps: stepResults,
    aggregate_steps: computeAggregateSteps(stepResults, steps),
    ...(params.sampling_factor && params.sampling_factor < 1 ? { sampling_factor: params.sampling_factor } : {}),
  };
}

// ── Time to Convert query ────────────────────────────────────────────────────

export async function queryFunnelTimeToConvert(
  ch: ClickHouseClient,
  params: TimeToConvertParams,
): Promise<TimeToConvertResult> {
  const { steps, project_id, from_step: fromStep, to_step: toStep } = params;
  const numSteps = steps.length;
  const windowSeconds = resolveWindowSeconds(params);

  if (fromStep >= toStep) {
    throw new BadRequestException('from_step must be strictly less than to_step');
  }
  if (toStep >= numSteps) {
    throw new BadRequestException(`to_step ${toStep} out of range (max ${numSteps - 1})`);
  }

  const queryParams: Record<string, unknown> = {
    project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    window: windowSeconds,
    step_names: steps.map((s) => s.event_name),
    to_step_num: toStep + 1,
  };
  steps.forEach((s, i) => {
    queryParams[`step_${i}`] = s.event_name;
  });

  const cohortClause = params.cohort_filters?.length
    ? ' AND ' + buildCohortFilterClause(params.cohort_filters, 'project_id', queryParams)
    : '';

  const samplingClause = buildSamplingClause(params.sampling_factor, queryParams);

  const stepConditions = steps.map((s, i) => buildStepCondition(s, i, queryParams)).join(', ');

  // Per-step minIf timestamps
  const stepTimestampCols = steps.map(
    (s, i) => `minIf(toUnixTimestamp64Milli(timestamp), ${buildStepCondition(s, i, queryParams)}) AS step_${i}_ms`,
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
