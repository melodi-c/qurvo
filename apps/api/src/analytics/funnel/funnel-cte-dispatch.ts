import type { Expr, QueryNode } from '@qurvo/ch-query';
import type { FunnelStep, FunnelExclusion, FunnelOrderType } from './funnel.types';
import type { FunnelChQueryParams } from './funnel-params';
import { buildStepCondition } from './funnel-steps';
import { buildOrderedFunnelCTEs } from './funnel-ordered.sql';
import { buildUnorderedFunnelCTEs } from './funnel-unordered.sql';

// ── CTE dispatch helper ─────────────────────────────────────────────────────

/**
 * Dispatches to the appropriate CTE builder based on the order type.
 * Eliminates the duplicated `if (orderType === 'unordered') { ... } else { ... }` pattern
 * that was repeated in funnel.query.ts and funnel-cohort-breakdown.ts.
 */
export function buildFunnelCTEs(
  orderType: FunnelOrderType,
  options: {
    steps: FunnelStep[];
    exclusions: FunnelExclusion[];
    cohortExpr?: Expr;
    samplingExpr?: Expr;
    queryParams: FunnelChQueryParams;
    /** Only used by ordered/strict path */
    stepConditions?: Expr[];
    /** Only used by ordered/strict path */
    numSteps?: number;
    /** Only used by ordered/strict path */
    breakdownExpr?: Expr;
    /** Only used by ordered/strict path */
    includeTimestampCols?: boolean;
  },
): { ctes: Array<{ name: string; query: QueryNode }>; hasExclusions: boolean } {
  if (orderType === 'unordered') {
    return buildUnorderedFunnelCTEs({
      steps: options.steps,
      exclusions: options.exclusions,
      cohortExpr: options.cohortExpr,
      samplingExpr: options.samplingExpr,
      queryParams: options.queryParams,
      breakdownExpr: options.breakdownExpr,
    });
  }
  const stepConditions = options.stepConditions ?? options.steps.map((s, i) => buildStepCondition(s, i));
  const numSteps = options.numSteps ?? options.steps.length;
  return buildOrderedFunnelCTEs({
    steps: options.steps,
    orderType,
    stepConditions,
    exclusions: options.exclusions,
    cohortExpr: options.cohortExpr,
    samplingExpr: options.samplingExpr,
    numSteps,
    queryParams: options.queryParams,
    breakdownExpr: options.breakdownExpr,
    includeTimestampCols: options.includeTimestampCols,
  });
}
