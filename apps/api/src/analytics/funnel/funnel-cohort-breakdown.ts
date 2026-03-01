import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import {
  select,
  col,
  countIf,
  gte,
  literal,
  add,
  and,
  type Expr,
  type QueryNode,
} from '@qurvo/ch-query';
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
import { cohortBounds } from '../query-helpers';
import {
  avgTimeSecondsExpr,
  stepsSubquery as buildStepsSubquery,
  notInExcludedUsers,
  type FunnelChQueryParams,
} from './funnel-sql-shared';

interface CohortBreakdownResult {
  steps: FunnelBreakdownStepResult[];
  aggregate_steps: FunnelStepResult[];
}

/**
 * Builds a cohort funnel query node from CTEs.
 * Shared between per-cohort and aggregate paths.
 */
function buildCohortFunnelNode(
  cteResult: { ctes: Array<{ name: string; query: QueryNode }>; hasExclusions: boolean },
  queryParams: FunnelChQueryParams,
  numSteps: number,
): QueryNode {
  const whereConditions: Expr[] = [];
  if (cteResult.hasExclusions) {
    whereConditions.push(notInExcludedUsers());
  }

  const builder = select(
    col('step_num'),
    countIf(gte(col('max_step'), col('step_num'))).as('entered'),
    countIf(gte(col('max_step'), add(col('step_num'), literal(1)))).as('next_step'),
    avgTimeSecondsExpr(queryParams),
  )
    .withAll(cteResult.ctes)
    .from('funnel_per_user')
    .crossJoin(buildStepsSubquery(numSteps), 'steps');

  if (whereConditions.length > 0) {
    builder.where(...whereConditions);
  }

  builder
    .groupBy(col('step_num'))
    .orderBy(col('step_num'));

  return builder.build();
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
  stepConditions: Expr[],
  cohortExpr: Expr | undefined,
  samplingExpr: Expr | undefined,
): Promise<CohortBreakdownResult> {
  const cohortBreakdowns = params.breakdown_cohort_ids ?? [];
  const { steps, exclusions = [] } = params;
  const orderType = params.funnel_order_type ?? 'ordered';
  const numSteps = steps.length;

  const perCohortResults: Awaited<ReturnType<typeof computeCohortBreakdownStepResults>>[] = [];

  for (let cbIdx = 0; cbIdx < cohortBreakdowns.length; cbIdx++) {
    const cb = cohortBreakdowns[cbIdx];
    const cbParamKey = `cohort_bd_${cb.cohort_id.replace(/-/g, '')}`;
    const cbQueryParams = { ...baseQueryParams };

    const { dateTo, dateFrom } = cohortBounds(params);
    const cohortFilterExpr = buildCohortFilterForBreakdown(
      cb, cbParamKey, 900 + cbIdx, cbQueryParams, dateTo, dateFrom,
    );
    // Combine base cohort filter with per-breakdown cohort filter
    const combinedCohortExpr = cohortExpr
      ? and(cohortExpr, cohortFilterExpr)
      : cohortFilterExpr;

    let cteResult;

    if (orderType === 'unordered') {
      cteResult = buildUnorderedFunnelCTEs({
        steps,
        exclusions,
        cohortExpr: combinedCohortExpr,
        samplingExpr,
        queryParams: cbQueryParams,
      });
    } else {
      cteResult = buildOrderedFunnelCTEs({
        steps,
        orderType,
        stepConditions,
        exclusions,
        cohortExpr: combinedCohortExpr,
        samplingExpr,
        numSteps,
        queryParams: cbQueryParams,
        includeTimestampCols: true,
      });
    }

    const node = buildCohortFunnelNode(cteResult, cbQueryParams, numSteps);
    const rows = await new ChQueryExecutor(ch).rows<RawFunnelRow>(node);
    perCohortResults.push(computeCohortBreakdownStepResults(rows, steps, numSteps, cb.cohort_id, cb.name));
  }

  const allBreakdownSteps = perCohortResults.flat();

  // Run a separate no-breakdown query for aggregate_steps.
  const aggregateQueryParams = { ...baseQueryParams };
  let aggregateCteResult;

  if (orderType === 'unordered') {
    aggregateCteResult = buildUnorderedFunnelCTEs({
      steps,
      exclusions,
      cohortExpr,
      samplingExpr,
      queryParams: aggregateQueryParams,
    });
  } else {
    aggregateCteResult = buildOrderedFunnelCTEs({
      steps,
      orderType,
      stepConditions,
      exclusions,
      cohortExpr,
      samplingExpr,
      numSteps,
      queryParams: aggregateQueryParams,
      includeTimestampCols: true,
    });
  }

  const aggregateNode = buildCohortFunnelNode(aggregateCteResult, aggregateQueryParams, numSteps);
  const aggregateRows = await new ChQueryExecutor(ch).rows<RawFunnelRow>(aggregateNode);
  const aggregateSteps = computeStepResults(aggregateRows, steps, numSteps);

  return {
    steps: allBreakdownSteps,
    aggregate_steps: aggregateSteps,
  };
}
