import type { ClickHouseClient } from '@shot/clickhouse';

/** Converts an ISO 8601 timestamp to the format ClickHouse expects for DateTime64(3) parameters. */
function toChTs(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '');
}

/**
 * Resolves the canonical person_id using the overrides dictionary (PostHog-style "Persons on Events").
 */
const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('shot_analytics.person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

export interface StepFilter {
  property: string;
  operator: FilterOperator;
  value?: string;
}

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
  | { breakdown: true; breakdown_property: string; steps: FunnelBreakdownStepResult[] };

export interface FunnelQueryParams {
  project_id: string;
  steps: FunnelStep[];
  conversion_window_days: number;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
}

const TOP_LEVEL_COLUMNS = new Set([
  'country', 'region', 'city', 'device_type', 'browser',
  'browser_version', 'os', 'os_version', 'language',
]);

function resolvePropertyExpr(prop: string): string {
  if (prop.startsWith('properties.')) {
    const key = prop.slice('properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(properties, '${key}')`;
  }
  if (prop.startsWith('user_properties.')) {
    const key = prop.slice('user_properties.'.length).replace(/'/g, "\\'");
    return `JSONExtractString(user_properties, '${key}')`;
  }
  if (TOP_LEVEL_COLUMNS.has(prop)) return prop;
  return prop;
}

function resolveBreakdownExpr(prop: string): string {
  return resolvePropertyExpr(prop);
}

/** Builds the windowFunnel condition for one step, injecting filter params into queryParams. */
function buildStepCondition(
  step: FunnelStep,
  idx: number,
  queryParams: Record<string, unknown>,
): string {
  const parts = [`event_name = {step_${idx}:String}`];
  for (const [j, filter] of (step.filters ?? []).entries()) {
    const expr = resolvePropertyExpr(filter.property);
    const paramKey = `step_${idx}_f${j}_v`;
    switch (filter.operator) {
      case 'eq':
        queryParams[paramKey] = filter.value ?? '';
        parts.push(`${expr} = {${paramKey}:String}`);
        break;
      case 'neq':
        queryParams[paramKey] = filter.value ?? '';
        parts.push(`${expr} != {${paramKey}:String}`);
        break;
      case 'contains':
        queryParams[paramKey] = `%${filter.value ?? ''}%`;
        parts.push(`${expr} LIKE {${paramKey}:String}`);
        break;
      case 'not_contains':
        queryParams[paramKey] = `%${filter.value ?? ''}%`;
        parts.push(`${expr} NOT LIKE {${paramKey}:String}`);
        break;
      case 'is_set':
        parts.push(`${expr} != ''`);
        break;
      case 'is_not_set':
        parts.push(`(${expr} = '' OR isNull(${expr}))`);
        break;
    }
  }
  return parts.join(' AND ');
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
    to: toChTs(params.date_to),
    window: windowSeconds,
    num_steps: numSteps,
    step_names: steps.map((s) => s.event_name),
  };
  steps.forEach((s, i) => {
    queryParams[`step_${i}`] = s.event_name;
  });

  const stepConditions = steps.map((s, i) => buildStepCondition(s, i, queryParams)).join(', ');

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
            AND event_name IN ({step_names:Array(String)})
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
    const breakdownExpr = resolveBreakdownExpr(params.breakdown_property);
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
            AND event_name IN ({step_names:Array(String)})
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

    return { breakdown: true, breakdown_property: params.breakdown_property, steps: stepResults };
  }
}
