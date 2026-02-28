import type { CohortAggregationType, CohortEventCondition } from '@qurvo/db';
import type { Expr, SelectNode } from '../../ast';
import { select, raw, rawWithParams, and, lte, gte, eq as bEq } from '../../builders';
import {
  RESOLVED_PERSON,
  buildEventFilterClauses,
  resolveEventPropertyExpr,
  buildOperatorClause,
  resolveDateTo,
  resolveDateFrom,
} from '../helpers';
import { compileExprToSql } from '../../compiler';
import type { BuildContext } from '../types';

function buildAggregationExpr(type: CohortAggregationType | undefined, property: string | undefined): Expr {
  if (!type || type === 'count') return raw('count()');
  const propExpr = resolveEventPropertyExpr(property ?? '');
  const propSql = compileExprToSql(propExpr).sql;
  const numExpr = `toFloat64OrZero(${propSql})`;
  switch (type) {
    case 'sum': return raw(`sum(${numExpr})`);
    case 'avg': return raw(`avg(${numExpr})`);
    case 'min': return raw(`min(${numExpr})`);
    case 'max': return raw(`max(${numExpr})`);
    case 'median': return raw(`quantile(0.50)(${numExpr})`);
    case 'p75': return raw(`quantile(0.75)(${numExpr})`);
    case 'p90': return raw(`quantile(0.90)(${numExpr})`);
    case 'p95': return raw(`quantile(0.95)(${numExpr})`);
    case 'p99': return raw(`quantile(0.99)(${numExpr})`);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled aggregation type: ${_exhaustive}`);
    }
  }
}

/**
 * Builds a SelectNode for `count_operator='eq', count=0` (i.e. "performed event exactly 0 times").
 */
function buildEventZeroCountSubquery(
  cond: CohortEventCondition,
  ctx: BuildContext,
  condIdx: number,
): SelectNode {
  const eventPk = `coh_${condIdx}_event`;
  const daysPk = `coh_${condIdx}_days`;

  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const upperSql = compileExprToSql(upperBound).sql;
  const lowerBoundSql = lowerBound
    ? compileExprToSql(lowerBound).sql
    : `${upperSql} - INTERVAL {${daysPk}:UInt32} DAY`;

  // Build countIf condition parts
  const countIfParts: string[] = [`event_name = {${eventPk}:String}`];
  if (cond.event_filters && cond.event_filters.length > 0) {
    for (let i = 0; i < cond.event_filters.length; i++) {
      const f = cond.event_filters[i];
      const pk = `coh_${condIdx}_ef${i}`;
      const expr = resolveEventPropertyExpr(f.property);
      const clauseExpr = buildOperatorClause(expr, f.operator, pk, ctx.queryParams, f.value, f.values);
      countIfParts.push(compileExprToSql(clauseExpr).sql);
    }
  }

  const countIfCond = countIfParts.join(' AND ');

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`timestamp >= ${lowerBoundSql}`),
      raw(`timestamp <= ${upperSql}`),
    )
    .groupBy(raw('person_id'))
    .having(raw(`countIf(${countIfCond}) = 0`))
    .build();
}

export function buildEventConditionSubquery(
  cond: CohortEventCondition,
  ctx: BuildContext,
): SelectNode {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const countPk = `coh_${condIdx}_count`;
  const daysPk = `coh_${condIdx}_days`;

  const isCount = !cond.aggregation_type || cond.aggregation_type === 'count';

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[countPk] = cond.count;
  ctx.queryParams[daysPk] = cond.time_window_days;

  // Special case: "performed event exactly 0 times"
  if (cond.count_operator === 'eq' && cond.count === 0 && isCount) {
    return buildEventZeroCountSubquery(cond, ctx, condIdx);
  }

  let countOp: string;
  switch (cond.count_operator) {
    case 'gte': countOp = '>='; break;
    case 'lte': countOp = '<='; break;
    case 'eq':  countOp = '=';  break;
  }

  const aggExpr = buildAggregationExpr(cond.aggregation_type, cond.aggregation_property);
  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const thresholdType = isCount ? 'UInt64' : 'Float64';
  const upperBound = resolveDateTo(ctx);
  const upperSql = compileExprToSql(upperBound).sql;
  const aggSql = compileExprToSql(aggExpr).sql;

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`event_name = {${eventPk}:String}`),
      raw(`timestamp >= ${upperSql} - INTERVAL {${daysPk}:UInt32} DAY`),
      raw(`timestamp <= ${upperSql}`),
      filterExpr,
    )
    .groupBy(raw('person_id'))
    .having(raw(`${aggSql} ${countOp} {${countPk}:${thresholdType}}`))
    .build();
}
