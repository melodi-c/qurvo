import { rawWithParams, select, col, raw, type QueryNode } from '@qurvo/ch-query';
import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildWindowFunnelExpr,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildStepCondition,
  funnelTsExpr,
  type FunnelChQueryParams,
} from './funnel-sql-shared';

export interface OrderedCTEOptions {
  steps: FunnelStep[];
  orderType: 'ordered' | 'strict';
  stepConditions: string;
  exclusions: FunnelExclusion[];
  cohortClause: string;
  samplingClause: string;
  numSteps: number;
  queryParams: FunnelChQueryParams;
  breakdownExpr?: string;
  includeTimestampCols?: boolean;
}

/**
 * Return type for the ordered/strict funnel CTE builder.
 * Each CTE is a named QueryNode, composable via SelectBuilder.withAll().
 */
export interface OrderedCTEResult {
  /** Named CTEs in dependency order (funnel_raw?, funnel_per_user, excluded_users?) */
  ctes: Array<{ name: string; query: QueryNode }>;
  /** Whether exclusions are active — caller uses this to build WHERE clause */
  hasExclusions: boolean;
}

/**
 * Builds the ordered/strict funnel CTEs using windowFunnel().
 *
 * Returns an array of named QueryNode CTEs that the caller attaches via .withAll().
 * Complex CTE bodies use rawWithParams() as the escape hatch for ClickHouse-specific
 * expressions (windowFunnel, arrayFilter, groupArrayIf).
 */
export function buildOrderedFunnelCTEs(options: OrderedCTEOptions): OrderedCTEResult {
  const {
    steps, orderType, stepConditions, exclusions, cohortClause,
    samplingClause, numSteps, queryParams, breakdownExpr, includeTimestampCols,
  } = options;

  const wfExpr = buildWindowFunnelExpr(orderType, stepConditions);
  const fromExpr = funnelTsExpr('from', queryParams);
  const toExpr = funnelTsExpr('to', queryParams);

  // Ordered mode: filter to only funnel-relevant events (step + exclusion names) for efficiency.
  // Strict mode: windowFunnel('strict_order') resets progress on any intervening event that
  // doesn't match the current or next expected step. So it must see ALL events for correctness.
  // However, we still pre-filter to users who have at least one funnel step event.
  const strictUserFilter = [
    '',
    '                AND distinct_id IN (',
    '                  SELECT DISTINCT distinct_id',
    '                  FROM events',
    '                  WHERE project_id = {project_id:UUID}',
    `                    AND timestamp >= ${fromExpr}`,
    `                    AND timestamp <= ${toExpr}`,
    '                    AND event_name IN ({all_event_names:Array(String)})',
    '                )',
  ].join('\n');
  const eventNameFilter = orderType === 'strict'
    ? strictUserFilter
    : '\n                AND event_name IN ({all_event_names:Array(String)})';

  // Build full step conditions for step 0 and last step.
  const step0Cond = buildStepCondition(steps[0]!, 0, queryParams);
  const lastStepCond = buildStepCondition(steps[numSteps - 1]!, numSteps - 1, queryParams);

  // Optional breakdown column.
  const breakdownCol = breakdownExpr
    ? `,\n              ${orderType === 'strict' ? 'argMaxIf' : 'argMinIf'}(${breakdownExpr}, timestamp, ${step0Cond}) AS breakdown_value`
    : '';

  // Exclusion columns
  const exclColumns = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps, queryParams)
    : [];
  const exclColumnsSQL = exclColumns.length > 0
    ? ',\n              ' + exclColumns.join(',\n              ')
    : '';

  const ctes: Array<{ name: string; query: QueryNode }> = [];

  if (includeTimestampCols && (orderType === 'ordered' || orderType === 'strict')) {
    // Two-CTE approach for ordered and strict modes: collect step_0 timestamps + last_step_ms
    // in raw CTE, then derive the correct first_step_ms in funnel_per_user.
    const winMs = `toInt64({window:UInt64}) * 1000`;

    // funnel_raw CTE: aggregates per person with windowFunnel + timestamp arrays
    const rawCteSql = `
              ${RESOLVED_PERSON} AS person_id,
              ${wfExpr} AS max_step${breakdownCol},
              groupArrayIf(toUnixTimestamp64Milli(timestamp), ${step0Cond}) AS t0_arr,
              toInt64(minIf(toUnixTimestamp64Milli(timestamp), ${lastStepCond})) AS last_step_ms${exclColumnsSQL}`;

    const rawCteWhere = `
              project_id = {project_id:UUID}
              AND timestamp >= ${fromExpr}
              AND timestamp <= ${toExpr}${eventNameFilter}${cohortClause}${samplingClause}`;

    const funnelRawNode = select(rawWithParams(rawCteSql, queryParams))
      .from('events')
      .where(rawWithParams(rawCteWhere, queryParams))
      .groupBy(raw('person_id'))
      .build();

    ctes.push({ name: 'funnel_raw', query: funnelRawNode });

    // Forward exclusion column names from raw CTE into funnel_per_user.
    const exclColsForward = exclColumns.length > 0
      ? ',\n              ' + exclColumns.map(c => c.split(' AS ')[1]!).join(',\n              ')
      : '';

    const breakdownForward = breakdownExpr ? ',\n              breakdown_value' : '';

    // first_step_ms: step_0 timestamp where last_step_ms falls within [t0, t0 + window].
    const arrayAgg = orderType === 'strict' ? 'arrayMax' : 'arrayMin';
    const firstStepMsExpr = `if(
              notEmpty(arrayFilter(t0 -> t0 <= last_step_ms AND last_step_ms <= t0 + ${winMs} AND last_step_ms > 0, t0_arr)),
              toInt64(${arrayAgg}(arrayFilter(t0 -> t0 <= last_step_ms AND last_step_ms <= t0 + ${winMs} AND last_step_ms > 0, t0_arr))),
              toInt64(0)
            )`;

    const funnelPerUserSql = `
              person_id,
              max_step${breakdownForward},
              ${firstStepMsExpr} AS first_step_ms,
              last_step_ms${exclColsForward}`;

    const funnelPerUserNode = select(raw(funnelPerUserSql))
      .from('funnel_raw')
      .build();

    ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });
  } else {
    // Single-CTE approach: no timestamp columns needed or unordered mode.
    const timestampCols = includeTimestampCols
      ? `,\n              minIf(toUnixTimestamp64Milli(timestamp), ${step0Cond}) AS first_step_ms,\n              minIf(toUnixTimestamp64Milli(timestamp), ${lastStepCond}) AS last_step_ms`
      : '';

    const singleCteSql = `
              ${RESOLVED_PERSON} AS person_id,
              ${wfExpr} AS max_step${breakdownCol}${timestampCols}${exclColumnsSQL}`;

    const singleCteWhere = `
              project_id = {project_id:UUID}
              AND timestamp >= ${fromExpr}
              AND timestamp <= ${toExpr}${eventNameFilter}${cohortClause}${samplingClause}`;

    const funnelPerUserNode = select(rawWithParams(singleCteSql, queryParams))
      .from('events')
      .where(rawWithParams(singleCteWhere, queryParams))
      .groupBy(raw('person_id'))
      .build();

    ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });
  }

  // excluded_users CTE (if exclusions are present)
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions) });
  }

  return { ctes, hasExclusions: exclusions.length > 0 };
}
