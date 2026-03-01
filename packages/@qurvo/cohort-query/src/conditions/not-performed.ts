import type { CohortNotPerformedEventCondition } from '@qurvo/db';
import type { Expr, SelectNode } from '@qurvo/ch-query';
import {
  col, namedParam, literal, interval,
  eq, sub, and, countIf,
} from '@qurvo/ch-query';
import {
  applyOperator,
  resolveEventPropertyExpr,
  allocCondIdx,
  resolveDateTo,
  resolveDateFrom,
  eventsBaseSelect,
} from '../helpers';
import type { BuildContext } from '../types';

export function buildNotPerformedEventSubquery(
  cond: CohortNotPerformedEventCondition,
  ctx: BuildContext,
): SelectNode {
  const { condIdx, eventPk, daysPk } = allocCondIdx(ctx);

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[daysPk] = cond.time_window_days;

  // Build countIf condition as Expr
  const countIfParts: Expr[] = [
    eq(col('event_name'), namedParam(eventPk, 'String', cond.event_name)),
  ];
  if (cond.event_filters && cond.event_filters.length > 0) {
    for (let i = 0; i < cond.event_filters.length; i++) {
      const f = cond.event_filters[i];
      const pk = `coh_${condIdx}_ef${i}`;
      const expr = resolveEventPropertyExpr(f.property);
      countIfParts.push(applyOperator(expr, f.operator, pk, ctx.queryParams, f.value, f.values));
    }
  }
  const countIfCondExpr = and(...countIfParts);

  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const daysInterval = interval(namedParam(daysPk, 'UInt32', cond.time_window_days), 'DAY');
  const lowerExpr = lowerBound ?? sub(upperBound, daysInterval);

  return eventsBaseSelect(ctx, lowerExpr)
    .groupBy(col('person_id'))
    .having(eq(countIf(countIfCondExpr), literal(0)))
    .build();
}
