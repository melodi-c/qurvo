import type { CohortAggregationType, CohortEventCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClausesStr, buildOperatorClauseStr, resolveEventPropertyExprStr, resolveDateToStr, resolveDateFromStr } from '../helpers';
import type { BuildContext } from '../types';

function buildAggregationExpr(type: CohortAggregationType | undefined, property: string | undefined): string {
  if (!type || type === 'count') return 'count()';
  const prop = resolveEventPropertyExprStr(property ?? '');
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
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled aggregation type: ${_exhaustive}`);
    }
  }
}

/**
 * Builds a subquery for `count_operator='eq', count=0` (i.e. "performed event exactly 0 times").
 *
 * Users with zero occurrences of the target event never appear in any GROUP BY that filters on
 * event_name, so HAVING count() = 0 is always empty. The correct approach is a NOT IN subquery
 * that finds all persons active in the time window and excludes those who did perform the event.
 *
 * This mirrors the `buildNotPerformedEventSubquery` pattern from `not-performed.ts`.
 */
function buildEventZeroCountSubquery(
  cond: CohortEventCondition,
  ctx: BuildContext,
  condIdx: number,
): string {
  const eventPk = `coh_${condIdx}_event`;
  const daysPk = `coh_${condIdx}_days`;

  const upperBound = resolveDateToStr(ctx);
  const lowerBound = resolveDateFromStr(ctx);
  const lowerBoundExpr = lowerBound ?? `${upperBound} - INTERVAL {${daysPk}:UInt32} DAY`;

  // Build the countIf condition: event_name match + optional event filters.
  // Uses buildOperatorClauseStr (same as not-performed.ts) so all operators are correctly handled.
  let countIfCond = `event_name = {${eventPk}:String}`;
  if (cond.event_filters && cond.event_filters.length > 0) {
    for (let i = 0; i < cond.event_filters.length; i++) {
      const f = cond.event_filters[i];
      const pk = `coh_${condIdx}_ef${i}`;
      const expr = resolveEventPropertyExprStr(f.property);
      countIfCond += ` AND ${buildOperatorClauseStr(expr, f.operator, pk, ctx.queryParams, f.value, f.values)}`;
    }
  }

  // Single-pass countIf: persons active in window but zero matching events
  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events
    WHERE project_id = {${ctx.projectIdParam}:UUID}
      AND timestamp >= ${lowerBoundExpr}
      AND timestamp <= ${upperBound}
    GROUP BY person_id
    HAVING countIf(${countIfCond}) = 0`;
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

  // Special case: "performed event exactly 0 times" requires NOT IN semantics.
  // Users with zero occurrences never appear in GROUP BY (filtered by WHERE event_name = ...),
  // so HAVING count() = 0 is always empty. Use a countIf-based absence check instead.
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
  const filterClause = buildEventFilterClausesStr(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const thresholdType = isCount ? 'UInt64' : 'Float64';
  const upperBound = resolveDateToStr(ctx);

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events
    WHERE
      project_id = {${ctx.projectIdParam}:UUID}
      AND event_name = {${eventPk}:String}
      AND timestamp >= ${upperBound} - INTERVAL {${daysPk}:UInt32} DAY
      AND timestamp <= ${upperBound}${filterClause}
    GROUP BY person_id
    HAVING ${aggExpr} ${countOp} {${countPk}:${thresholdType}}`;
}
