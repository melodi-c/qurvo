import type { CohortAggregationType, CohortEventCondition, CohortEventFilter } from '@qurvo/db';
import type { Expr, SelectNode } from '@qurvo/ch-query';
import {
  rawWithParams, col, namedParam, literal,
  eq, gte, lte, sub, func, and, countIf, parametricFunc,
  toFloat64OrZero,
} from '@qurvo/ch-query';
import {
  buildEventFilterClauses,
  buildOperatorClause,
  resolveEventPropertyExpr,
  allocCondIdx,
  resolveDateTo,
  resolveDateFrom,
  eventsBaseSelect,
} from '../helpers';
import type { BuildContext } from '../types';

function buildAggregationExpr(type: CohortAggregationType | undefined, property: string | undefined): Expr {
  if (!type || type === 'count') return func('count');
  const propExpr = resolveEventPropertyExpr(property ?? '');
  const numExpr = toFloat64OrZero(propExpr);
  switch (type) {
    case 'sum': return func('sum', numExpr);
    case 'avg': return func('avg', numExpr);
    case 'min': return func('min', numExpr);
    case 'max': return func('max', numExpr);
    case 'median': return parametricFunc('quantile', [literal(0.50)], [numExpr]);
    case 'p75': return parametricFunc('quantile', [literal(0.75)], [numExpr]);
    case 'p90': return parametricFunc('quantile', [literal(0.90)], [numExpr]);
    case 'p95': return parametricFunc('quantile', [literal(0.95)], [numExpr]);
    case 'p99': return parametricFunc('quantile', [literal(0.99)], [numExpr]);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled aggregation type: ${_exhaustive}`);
    }
  }
}

/** Maps count_operator to a binary comparator. */
function comparator(op: 'gte' | 'lte' | 'eq'): (left: Expr, right: Expr) => Expr {
  switch (op) {
    case 'gte': return gte;
    case 'lte': return lte;
    case 'eq':  return eq;
  }
}

/**
 * Builds a countIf condition Expr: event_name = {pk:String} [AND filter1 AND filter2 ...]
 */
function buildCountIfCondExpr(
  eventPk: string,
  eventName: string,
  condIdx: number,
  filters: CohortEventFilter[] | undefined,
  queryParams: Record<string, unknown>,
): Expr {
  const parts: Expr[] = [eq(col('event_name'), namedParam(eventPk, 'String', eventName))];
  if (filters && filters.length > 0) {
    for (let i = 0; i < filters.length; i++) {
      const f = filters[i];
      const pk = `coh_${condIdx}_ef${i}`;
      const expr = resolveEventPropertyExpr(f.property);
      parts.push(buildOperatorClause(expr, f.operator, pk, queryParams, f.value, f.values));
    }
  }
  return and(...parts);
}

/**
 * Builds a SelectNode for `count_operator='eq', count=0` (i.e. "performed event exactly 0 times").
 */
function buildEventZeroCountSubquery(
  cond: CohortEventCondition,
  ctx: BuildContext,
  condIdx: number,
  eventPk: string,
  daysPk: string,
): SelectNode {
  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const daysInterval = rawWithParams(`INTERVAL {${daysPk}:UInt32} DAY`, { [daysPk]: cond.time_window_days });
  const lowerExpr = lowerBound ?? sub(upperBound, daysInterval);

  const countIfCond = buildCountIfCondExpr(eventPk, cond.event_name, condIdx, cond.event_filters, ctx.queryParams);

  return eventsBaseSelect(ctx, lowerExpr)
    .groupBy(col('person_id'))
    .having(eq(countIf(countIfCond), literal(0)))
    .build();
}

export function buildEventConditionSubquery(
  cond: CohortEventCondition,
  ctx: BuildContext,
): SelectNode {
  const { condIdx, eventPk, countPk, daysPk } = allocCondIdx(ctx);

  const isCount = !cond.aggregation_type || cond.aggregation_type === 'count';

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[countPk] = cond.count;
  ctx.queryParams[daysPk] = cond.time_window_days;

  // Special case: "performed event exactly 0 times"
  if (cond.count_operator === 'eq' && cond.count === 0 && isCount) {
    return buildEventZeroCountSubquery(cond, ctx, condIdx, eventPk, daysPk);
  }

  const cmp = comparator(cond.count_operator);
  const aggExpr = buildAggregationExpr(cond.aggregation_type, cond.aggregation_property);
  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const thresholdType = isCount ? 'UInt64' : 'Float64';
  const daysInterval = rawWithParams(`INTERVAL {${daysPk}:UInt32} DAY`, { [daysPk]: cond.time_window_days });
  const lowerExpr = sub(resolveDateTo(ctx), daysInterval);

  return eventsBaseSelect(ctx, lowerExpr,
      eq(col('event_name'), namedParam(eventPk, 'String', cond.event_name)),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .having(cmp(aggExpr, namedParam(countPk, thresholdType, cond.count)))
    .build();
}
