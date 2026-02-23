import type { CohortAggregationType, CohortEventCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClauses, resolveEventPropertyExpr } from '../helpers';
import type { BuildContext } from '../types';

function buildAggregationExpr(type: CohortAggregationType | undefined, property: string | undefined): string {
  if (!type || type === 'count') return 'count()';
  const prop = resolveEventPropertyExpr(property ?? '');
  const numExpr = `toFloat64OrZero(${prop})`;
  switch (type) {
    case 'sum': return `sum(${numExpr})`;
    case 'avg': return `avg(${numExpr})`;
    case 'min': return `min(${numExpr})`;
    case 'max': return `max(${numExpr})`;
    case 'median': return `quantile(0.50)(${numExpr})`;
    case 'p75': return `quantile(0.75)(${numExpr})`;
    case 'p90': return `quantile(0.90)(${numExpr})`;
    case 'p95': return `quantile(0.95)(${numExpr})`;
    case 'p99': return `quantile(0.99)(${numExpr})`;
  }
}

export function buildEventConditionSubquery(
  cond: CohortEventCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const countPk = `coh_${condIdx}_count`;
  const daysPk = `coh_${condIdx}_days`;

  const isCount = !cond.aggregation_type || cond.aggregation_type === 'count';

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[countPk] = cond.count;
  ctx.queryParams[daysPk] = cond.time_window_days;

  let countOp: string;
  switch (cond.count_operator) {
    case 'gte': countOp = '>='; break;
    case 'lte': countOp = '<='; break;
    case 'eq':  countOp = '=';  break;
  }

  const aggExpr = buildAggregationExpr(cond.aggregation_type, cond.aggregation_property);
  const filterClause = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const thresholdType = isCount ? 'UInt64' : 'Float64';

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE
      project_id = {${ctx.projectIdParam}:UUID}
      AND event_name = {${eventPk}:String}
      AND timestamp >= now() - INTERVAL {${daysPk}:UInt32} DAY${filterClause}
    GROUP BY person_id
    HAVING ${aggExpr} ${countOp} {${countPk}:${thresholdType}}`;
}
