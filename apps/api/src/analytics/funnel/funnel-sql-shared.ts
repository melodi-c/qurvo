/**
 * Barrel re-export — preserves backward compatibility for all existing importers.
 *
 * The original god module was split into focused files:
 *   funnel-params.ts        — FunnelChQueryParams, funnelTsParamExpr, buildBaseQueryParams
 *   funnel-window.ts        — resolveWindowSeconds
 *   funnel-steps.ts         — resolveStepEventNames, buildStepCondition, buildAllEventNames
 *   funnel-exclusions.ts    — validateExclusions, buildExclusionColumns, buildExcludedUsersCTE, extractExclColumnAliases
 *   funnel-shared-exprs.ts  — sampling, windowFunnel, unordered coverage, strict filter, shared predicates
 *   funnel-cte-dispatch.ts  — buildFunnelCTEs ordered/unordered dispatch helper
 */

export { type FunnelChQueryParams, funnelTsParamExpr, buildBaseQueryParams, RESOLVED_PERSON, toChTs } from './funnel-params';
export { resolveWindowSeconds } from './funnel-window';
export { resolveStepEventNames, buildStepCondition, buildAllEventNames } from './funnel-steps';
export { validateExclusions, buildExclusionColumns, buildExcludedUsersCTE, extractExclColumnAliases } from './funnel-exclusions';
export {
  buildSamplingClause,
  buildWindowFunnelExpr,
  validateUnorderedSteps,
  buildUnorderedCoverageExprsAST,
  buildStrictUserFilterExpr,
  avgTimeSecondsExpr,
  stepsSubquery,
  windowMsExpr,
  notInExcludedUsers,
  funnelProjectIdExpr,
  buildEmptyStepResults,
} from './funnel-shared-exprs';
export { buildFunnelCTEs } from './funnel-cte-dispatch';
