import type { ClickHouseClient } from '@qurvo/clickhouse';
import type {
  FunnelQueryParams,
  FunnelBreakdownStepResult,
  FunnelStepResult,
} from './funnel.types';
import { buildOrderedFunnelCTEs } from './funnel-ordered.sql';
import { buildUnorderedFunnelCTEs } from './funnel-unordered.sql';
import {
  computeCohortBreakdownStepResults,
  computeStepResults,
  type RawFunnelRow,
} from './funnel-results';
import { buildCohortFilterForBreakdown } from '../../cohorts/cohort-breakdown.util';
import type { FunnelChQueryParams } from './funnel-sql-shared';
import { toChTs } from '../../utils/clickhouse-helpers';

interface CohortBreakdownResult {
  steps: FunnelBreakdownStepResult[];
  aggregate_steps: FunnelStepResult[];
}

/**
 * Runs one ClickHouse query per cohort sequentially and assembles the combined breakdown result.
 * Sequential execution (for...of) prevents exhausting the ClickHouse connection pool when many
 * cohorts are requested. Called by queryFunnel when params.breakdown_cohort_ids is set.
 */
export async function runFunnelCohortBreakdown(
  ch: ClickHouseClient,
  params: FunnelQueryParams,
  baseQueryParams: FunnelChQueryParams,
  stepConditions: string,
  cohortClause: string,
  samplingClause: string,
): Promise<CohortBreakdownResult> {
  const cohortBreakdowns = params.breakdown_cohort_ids!;
  const { steps, exclusions = [] } = params;
  const orderType = params.funnel_order_type ?? 'ordered';
  const numSteps = steps.length;

  const perCohortResults: Awaited<ReturnType<typeof computeCohortBreakdownStepResults>>[] = [];

  for (let cbIdx = 0; cbIdx < cohortBreakdowns.length; cbIdx++) {
    const cb = cohortBreakdowns[cbIdx];
    const cbParamKey = `cohort_bd_${cb.cohort_id.replace(/-/g, '')}`;
    const cbQueryParams = { ...baseQueryParams };

    const cohortFilterPredicate = buildCohortFilterForBreakdown(
      cb, cbParamKey, 900 + cbIdx, cbQueryParams, toChTs(params.date_to, true),
    );
    const cohortFilter = ` AND ${cohortFilterPredicate}`;

    let sql: string;

    if (orderType === 'unordered') {
      const { cte, excludedUsersCTE, exclFilter } = buildUnorderedFunnelCTEs({
        steps,
        exclusions,
        cohortClause: `${cohortClause}${cohortFilter}`,
        samplingClause,
        queryParams: cbQueryParams,
      });
      sql = `
          WITH ${cte}${excludedUsersCTE}
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
          GROUP BY step_num ORDER BY step_num`;
    } else {
      const { funnelPerUserCTE, excludedUsersCTE, exclFilter } = buildOrderedFunnelCTEs({
        steps,
        orderType,
        stepConditions,
        exclusions,
        cohortClause: `${cohortClause}${cohortFilter}`,
        samplingClause,
        numSteps,
        queryParams: cbQueryParams,
        includeTimestampCols: true,
      });
      sql = `
          WITH
            ${funnelPerUserCTE}${excludedUsersCTE}
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

    const result = await ch.query({ query: sql, query_params: cbQueryParams, format: 'JSONEachRow' });
    const rows = await result.json<RawFunnelRow>();
    perCohortResults.push(computeCohortBreakdownStepResults(rows, steps, numSteps, cb.cohort_id, cb.name));
  }

  const allBreakdownSteps = perCohortResults.flat();

  // Run a separate no-breakdown query for aggregate_steps.
  // Summing per-cohort counts would double-count users who belong to multiple cohorts.
  // The no-breakdown query counts each unique user exactly once, regardless of cohort membership.
  const aggregateQueryParams = { ...baseQueryParams };
  let aggregateSql: string;

  if (orderType === 'unordered') {
    const { cte, excludedUsersCTE, exclFilter } = buildUnorderedFunnelCTEs({
      steps,
      exclusions,
      cohortClause,
      samplingClause,
      queryParams: aggregateQueryParams,
    });
    aggregateSql = `
        WITH ${cte}${excludedUsersCTE}
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
        GROUP BY step_num ORDER BY step_num`;
  } else {
    const { funnelPerUserCTE, excludedUsersCTE, exclFilter } = buildOrderedFunnelCTEs({
      steps,
      orderType,
      stepConditions,
      exclusions,
      cohortClause,
      samplingClause,
      numSteps,
      queryParams: aggregateQueryParams,
      includeTimestampCols: true,
    });
    aggregateSql = `
        WITH
          ${funnelPerUserCTE}${excludedUsersCTE}
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

  const aggregateResult = await ch.query({
    query: aggregateSql,
    query_params: aggregateQueryParams,
    format: 'JSONEachRow',
  });
  const aggregateRows = await aggregateResult.json<RawFunnelRow>();
  const aggregateSteps = computeStepResults(aggregateRows, steps, numSteps);

  return {
    steps: allBreakdownSteps,
    aggregate_steps: aggregateSteps,
  };
}
