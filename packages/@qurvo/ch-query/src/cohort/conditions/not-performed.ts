import type { CohortNotPerformedEventCondition } from '@qurvo/db';
import type { SelectNode } from '../../ast';
import { select, raw } from '../../builders';
import {
  RESOLVED_PERSON,
  resolveEventPropertyExpr,
  buildOperatorClause,
  resolveDateTo,
  resolveDateFrom,
} from '../helpers';
import { compileExprToSql } from '../../compiler';
import type { BuildContext } from '../types';

export function buildNotPerformedEventSubquery(
  cond: CohortNotPerformedEventCondition,
  ctx: BuildContext,
): SelectNode {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const daysPk = `coh_${condIdx}_days`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[daysPk] = cond.time_window_days;

  // Build countIf condition: event_name match + optional filters
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

  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const upperSql = compileExprToSql(upperBound).sql;
  const lowerBoundSql = lowerBound
    ? compileExprToSql(lowerBound).sql
    : `${upperSql} - INTERVAL {${daysPk}:UInt32} DAY`;

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
