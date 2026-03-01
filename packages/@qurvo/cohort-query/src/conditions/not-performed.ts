import type { CohortNotPerformedEventCondition } from '@qurvo/db';
import type { Expr, SelectNode } from '@qurvo/ch-query';
import {
  select, raw, rawWithParams, col, namedParam, literal,
  eq, gte, lte, sub, and, countIf,
} from '@qurvo/ch-query';
import {
  RESOLVED_PERSON,
  buildOperatorClause,
  resolveEventPropertyExpr,
  allocCondIdx,
  resolveDateTo,
  resolveDateFrom,
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
      countIfParts.push(buildOperatorClause(expr, f.operator, pk, ctx.queryParams, f.value, f.values));
    }
  }
  const countIfCondExpr = and(...countIfParts);

  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const daysInterval = rawWithParams(`INTERVAL {${daysPk}:UInt32} DAY`, { [daysPk]: cond.time_window_days });
  const lowerExpr = lowerBound ?? sub(upperBound, daysInterval);

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      eq(col('project_id'), namedParam(ctx.projectIdParam, 'UUID', ctx.queryParams[ctx.projectIdParam])),
      gte(col('timestamp'), lowerExpr),
      lte(col('timestamp'), upperBound),
    )
    .groupBy(col('person_id'))
    .having(eq(countIf(countIfCondExpr), literal(0)))
    .build();
}
