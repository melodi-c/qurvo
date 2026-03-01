import {
  select,
  col,
  and,
  eq,
  gte,
  lte,
  gt,
  add,
  mul,
  namedParam,
  inArray,
  toInt64,
  toUnixTimestamp64Milli,
  groupArrayIf,
  greatest,
  indexOf,
  arrayElement,
  func,
  lambda,
  ifExpr,
  literal,
  type Expr,
  type QueryNode,
} from '@qurvo/ch-query';
import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  buildStepCondition,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildUnorderedCoverageExprsAST,
  funnelTsParamExpr,
  extractExclColumnAliases,
  type FunnelChQueryParams,
} from './funnel-sql-shared';
import { resolvedPerson } from '../query-helpers';

export interface UnorderedCTEOptions {
  steps: FunnelStep[];
  exclusions: FunnelExclusion[];
  cohortExpr?: Expr;
  samplingExpr?: Expr;
  queryParams: FunnelChQueryParams;
  breakdownExpr?: Expr;
}

/**
 * Return type for the unordered funnel CTE builder.
 * Each CTE is a named QueryNode, composable via SelectBuilder.withAll().
 */
export interface UnorderedCTEResult {
  /** Named CTEs in dependency order (step_times, anchor_per_user, funnel_per_user, excluded_users?) */
  ctes: Array<{ name: string; query: QueryNode }>;
  /** Whether exclusions are active -- caller uses this to build WHERE clause */
  hasExclusions: boolean;
}

/**
 * Builds the unordered funnel CTEs using groupArrayIf + arrayExists anchor logic.
 *
 * Strategy:
 *   1. `step_times`: collect ALL per-step timestamps as arrays via `groupArrayIf`.
 *   2. `anchor_per_user`: intermediate CTE that computes max_step and anchor_ms
 *      using array lambdas.
 *   3. `funnel_per_user`: final shape expected by the outer query
 *      (max_step, first_step_ms, last_step_ms, breakdown_value, excl arrays).
 *
 * Returns an array of named QueryNode CTEs that the caller attaches via .withAll().
 * CTE bodies use the ch-query AST builder -- no raw SQL concatenation.
 */
export function buildUnorderedFunnelCTEs(options: UnorderedCTEOptions): UnorderedCTEResult {
  const { steps, exclusions, cohortExpr, samplingExpr, queryParams, breakdownExpr } = options;
  const N = steps.length;
  const winExprAST = mul(toInt64(namedParam('window', 'UInt64', queryParams.window)), literal(1000));
  const fromExpr = funnelTsParamExpr('from', queryParams);
  const toExpr = funnelTsParamExpr('to', queryParams);

  // Timestamp expression for groupArrayIf
  const tsExpr = toUnixTimestamp64Milli(col('timestamp'));

  // Build step conditions as Expr
  const stepCondExprs = steps.map((s, i) => buildStepCondition(s, i));

  // ---- Step 1: groupArrayIf columns per step ----
  const groupArrayCols: Expr[] = stepCondExprs.map((cond, i) =>
    groupArrayIf(tsExpr, cond).as(`t${i}_arr`),
  );

  // ---- Steps 2-4: coverage, max_step, anchor_ms -- shared with TTC unordered ----
  const { maxStepExpr, anchorMsExpr } =
    buildUnorderedCoverageExprsAST(N, winExprAST, steps);

  // ---- Step 5: breakdown_value ----
  const breakdownArrCol: Expr[] = breakdownExpr
    ? [groupArrayIf(breakdownExpr, stepCondExprs[0]).as('t0_bv_arr')]
    : [];

  // ---- Step 6: exclusion array columns ----
  const exclCols: Expr[] = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps)
    : [];

  // ---- Base WHERE ----
  const baseWhere = and(
    eq(col('project_id'), namedParam('project_id', 'UUID', queryParams.project_id)),
    gte(col('timestamp'), fromExpr),
    lte(col('timestamp'), toExpr),
    inArray(col('event_name'), namedParam('all_event_names', 'Array(String)', queryParams.all_event_names)),
    cohortExpr,
    samplingExpr,
  );

  // ---- Forward columns from step_times into anchor_per_user ----
  const breakdownArrForward: Expr[] = breakdownExpr ? [col('t0_bv_arr')] : [];
  const exclColAliases = extractExclColumnAliases(exclCols);
  const exclColForwardExprs: Expr[] = exclColAliases.map(a => col(a));
  const stepArrCols: Expr[] = steps.map((_, i) => col(`t${i}_arr`));

  // ---- Step 7: last_step_ms -- latest step in the winning window ----
  // For each step j: arrayMax(lt -> if(lt >= anchor_ms AND lt <= anchor_ms + win, lt, 0), t_j_arr)
  const stepLastInWindowExprs: Expr[] = steps.map((_, j) =>
    func('arrayMax',
      lambda([`lt${j}`], ifExpr(
        and(
          gte(col(`lt${j}`), col('anchor_ms')),
          lte(col(`lt${j}`), add(col('anchor_ms'), winExprAST)),
        ),
        col(`lt${j}`),
        toInt64(literal(0)),
      )),
      col(`t${j}_arr`),
    ),
  );
  const lastStepMsExpr = stepLastInWindowExprs.length === 1
    ? stepLastInWindowExprs[0]
    : greatest(...stepLastInWindowExprs);

  // ---- breakdown_value from anchor ----
  const breakdownValueExpr: Expr[] = breakdownExpr
    ? [arrayElement(col('t0_bv_arr'), indexOf(col('t0_arr'), col('anchor_ms'))).as('breakdown_value')]
    : [];

  // ---- Build CTEs as QueryNodes ----
  const ctes: Array<{ name: string; query: QueryNode }> = [];

  // CTE 1: step_times -- aggregates per person with groupArrayIf per step
  const stepTimesNode = select(
    resolvedPerson().as('person_id'),
    ...groupArrayCols,
    ...breakdownArrCol,
    ...exclCols,
  )
    .from('events')
    .where(baseWhere)
    .groupBy(col('person_id'))
    .build();

  ctes.push({ name: 'step_times', query: stepTimesNode });

  // CTE 2: anchor_per_user -- computes max_step and anchor_ms from arrays
  const anchorPerUserNode = select(
    col('person_id'),
    toInt64(maxStepExpr).as('max_step'),
    toInt64(anchorMsExpr).as('anchor_ms'),
    ...breakdownArrForward,
    ...exclColForwardExprs,
    ...stepArrCols,
  )
    .from('step_times')
    .where(gt(func('length', col('t0_arr')), literal(0)))
    .build();

  ctes.push({ name: 'anchor_per_user', query: anchorPerUserNode });

  // CTE 3: funnel_per_user -- final shape with resolved timestamps
  const funnelPerUserNode = select(
    col('person_id'),
    col('max_step'),
    col('anchor_ms').as('first_step_ms'),
    toInt64(lastStepMsExpr).as('last_step_ms'),
    ...breakdownValueExpr,
    ...exclColForwardExprs,
  )
    .from('anchor_per_user')
    .build();

  ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });

  // CTE 4: excluded_users (if exclusions present) -- anchorFilter=true for unordered (#497)
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions, true) });
  }

  return { ctes, hasExclusions: exclusions.length > 0 };
}
