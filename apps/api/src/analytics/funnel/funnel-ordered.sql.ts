import {
  select,
  col,
  and,
  eq,
  gt,
  gte,
  lte,
  add,
  mul,
  namedParam,
  toInt64,
  toUnixTimestamp64Milli,
  groupArrayIf,
  minIf,
  argMinIf,
  argMaxIf,
  func,
  lambda,
  ifExpr,
  notEmpty,
  literal,
  alias,
  type Expr,
  type QueryNode,
} from '@qurvo/ch-query';
import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  buildWindowFunnelExpr,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildStepCondition,
  buildStrictUserFilterExpr,
  funnelTsParamExpr,
  extractExclColumnAliases,
  windowMsExpr,
  funnelProjectIdExpr,
  type FunnelChQueryParams,
} from './funnel-sql-shared';
import { resolvedPerson } from '../query-helpers';

export interface OrderedCTEOptions {
  steps: FunnelStep[];
  orderType: 'ordered' | 'strict';
  stepConditions: Expr[];
  exclusions: FunnelExclusion[];
  cohortExpr?: Expr;
  samplingExpr?: Expr;
  numSteps: number;
  queryParams: FunnelChQueryParams;
  breakdownExpr?: Expr;
  includeTimestampCols?: boolean;
}

/**
 * Return type for the ordered/strict funnel CTE builder.
 * Each CTE is a named QueryNode, composable via SelectBuilder.withAll().
 */
export interface OrderedCTEResult {
  /** Named CTEs in dependency order (funnel_raw?, funnel_per_user, excluded_users?) */
  ctes: Array<{ name: string; query: QueryNode }>;
  /** Whether exclusions are active -- caller uses this to build WHERE clause */
  hasExclusions: boolean;
}

/**
 * Builds the ordered/strict funnel CTEs using windowFunnel().
 *
 * Returns an array of named QueryNode CTEs that the caller attaches via .withAll().
 * CTE bodies use the ch-query AST builder -- no raw SQL concatenation.
 */
export function buildOrderedFunnelCTEs(options: OrderedCTEOptions): OrderedCTEResult {
  const {
    steps, orderType, stepConditions, exclusions, cohortExpr,
    samplingExpr, numSteps, queryParams, breakdownExpr, includeTimestampCols,
  } = options;

  const fromExpr = funnelTsParamExpr('from', queryParams);
  const toExpr = funnelTsParamExpr('to', queryParams);

  // Event name filter expression (strict-mode subquery or simple IN clause)
  const eventNameFilterExpr = buildStrictUserFilterExpr(
    fromExpr, toExpr, 'all_event_names', queryParams.all_event_names,
    queryParams.project_id, orderType,
  );

  // Step 0 and last step conditions for timestamp collection
  const step0Cond = buildStepCondition(steps[0], 0);
  const lastStepCond = buildStepCondition(steps[numSteps - 1], numSteps - 1);

  // windowFunnel expression
  const wfExpr = buildWindowFunnelExpr(orderType, stepConditions);

  // Timestamp expression for groupArrayIf / minIf
  const tsExpr = toUnixTimestamp64Milli(col('timestamp'));

  // Breakdown column
  const breakdownCols: Expr[] = breakdownExpr
    ? [
      (orderType === 'strict' ? argMaxIf : argMinIf)(
        breakdownExpr, col('timestamp'), step0Cond,
      ).as('breakdown_value'),
    ]
    : [];

  // Exclusion columns (already Expr[] with aliases)
  const exclCols: Expr[] = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps)
    : [];

  // Base WHERE conditions shared by all CTE variants
  const baseWhere = and(
    funnelProjectIdExpr(queryParams),
    gte(col('timestamp'), fromExpr),
    lte(col('timestamp'), toExpr),
    eventNameFilterExpr,
    cohortExpr,
    samplingExpr,
  );

  const ctes: Array<{ name: string; query: QueryNode }> = [];

  if (includeTimestampCols && (orderType === 'ordered' || orderType === 'strict')) {
    // Two-CTE approach: collect step_0 timestamps + last_step_ms in funnel_raw,
    // then derive first_step_ms in funnel_per_user.

    const funnelRawNode = select(
      resolvedPerson().as('person_id'),
      alias(wfExpr, 'max_step'),
      ...breakdownCols,
      groupArrayIf(tsExpr, step0Cond).as('t0_arr'),
      toInt64(minIf(tsExpr, lastStepCond)).as('last_step_ms'),
      ...exclCols,
    )
      .from('events')
      .where(baseWhere)
      .groupBy(col('person_id'))
      .build();

    ctes.push({ name: 'funnel_raw', query: funnelRawNode });

    // Forward exclusion column aliases from funnel_raw into funnel_per_user
    const exclColForwardExprs: Expr[] = extractExclColumnAliases(exclCols).map(a => col(a));

    const breakdownForward: Expr[] = breakdownExpr ? [col('breakdown_value')] : [];

    // first_step_ms: pick step_0 timestamp where last_step_ms falls within [t0, t0 + window]
    const arrayAggFn = orderType === 'strict' ? 'arrayMax' : 'arrayMin';
    const winMs = windowMsExpr(queryParams);
    const filterLambda = lambda(['t0'], and(
      lte(col('t0'), col('last_step_ms')),
      lte(col('last_step_ms'), add(col('t0'), winMs)),
      gt(col('last_step_ms'), literal(0)),
    ));
    const filteredArr = func('arrayFilter', filterLambda, col('t0_arr'));

    const firstStepMsExpr = ifExpr(
      notEmpty(filteredArr),
      toInt64(func(arrayAggFn, filteredArr)),
      toInt64(literal(0)),
    ).as('first_step_ms');

    const funnelPerUserNode = select(
      col('person_id'),
      col('max_step'),
      ...breakdownForward,
      firstStepMsExpr,
      col('last_step_ms'),
      ...exclColForwardExprs,
    )
      .from('funnel_raw')
      .build();

    ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });
  } else {
    // Single-CTE approach: no timestamp columns needed or unordered mode
    const timestampCols: Expr[] = includeTimestampCols
      ? [
        minIf(tsExpr, step0Cond).as('first_step_ms'),
        minIf(tsExpr, lastStepCond).as('last_step_ms'),
      ]
      : [];

    const funnelPerUserNode = select(
      resolvedPerson().as('person_id'),
      alias(wfExpr, 'max_step'),
      ...breakdownCols,
      ...timestampCols,
      ...exclCols,
    )
      .from('events')
      .where(baseWhere)
      .groupBy(col('person_id'))
      .build();

    ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });
  }

  // excluded_users CTE (if exclusions are present)
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions) });
  }

  return { ctes, hasExclusions: exclusions.length > 0 };
}
