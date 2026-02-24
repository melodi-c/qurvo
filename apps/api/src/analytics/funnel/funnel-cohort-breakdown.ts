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
  computeAggregateSteps,
  type RawFunnelRow,
} from './funnel-results';
import { buildCohortFilterForBreakdown } from '../../cohorts/cohort-breakdown.util';

export interface CohortBreakdownResult {
  steps: FunnelBreakdownStepResult[];
  aggregate_steps: FunnelStepResult[];
}

/**
 * Runs one ClickHouse query per cohort and assembles the combined breakdown result.
 * Called by queryFunnel when params.breakdown_cohort_ids is set.
 */
export async function runFunnelCohortBreakdown(
  ch: ClickHouseClient,
  params: FunnelQueryParams,
  baseQueryParams: Record<string, unknown>,
  stepConditions: string,
  cohortClause: string,
  samplingClause: string,
): Promise<CohortBreakdownResult> {
  const cohortBreakdowns = params.breakdown_cohort_ids!;
  const { steps, exclusions = [] } = params;
  const orderType = params.funnel_order_type ?? 'ordered';
  const numSteps = steps.length;

  const perCohortResults = await Promise.all(
    cohortBreakdowns.map(async (cb, cbIdx) => {
      const cbParamKey = `cohort_bd_${cb.cohort_id.replace(/-/g, '')}`;
      const cbQueryParams = { ...baseQueryParams };

      const cohortFilterPredicate = buildCohortFilterForBreakdown(
        cb, cbParamKey, 900 + cbIdx, cbQueryParams,
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
          SELECT step_num, countIf(max_step >= step_num) AS entered, countIf(max_step >= step_num + 1) AS next_step
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
        });
        sql = `
          WITH
            ${funnelPerUserCTE}${excludedUsersCTE}
          SELECT
            step_num,
            countIf(max_step >= step_num) AS entered,
            countIf(max_step >= step_num + 1) AS next_step
          FROM funnel_per_user
          CROSS JOIN (SELECT number + 1 AS step_num FROM numbers({num_steps:UInt64})) AS steps${exclFilter}
          GROUP BY step_num
          ORDER BY step_num`;
      }

      const result = await ch.query({ query: sql, query_params: cbQueryParams, format: 'JSONEachRow' });
      const rows = await result.json<RawFunnelRow>();
      return computeCohortBreakdownStepResults(rows, steps, numSteps, cb.name);
    }),
  );

  const allBreakdownSteps = perCohortResults.flat();

  return {
    steps: allBreakdownSteps,
    aggregate_steps: computeAggregateSteps(allBreakdownSteps, steps),
  };
}
