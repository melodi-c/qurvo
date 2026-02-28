import type { CohortFirstTimeEventCondition } from '@qurvo/db';
import type { SelectNode } from '../../ast';
import { select, raw } from '../../builders';
import { RESOLVED_PERSON, buildEventFilterClauses, resolveDateTo } from '../helpers';
import { compileExprToSql } from '../../compiler';
import type { BuildContext } from '../types';

export function buildFirstTimeEventSubquery(
  cond: CohortFirstTimeEventCondition,
  ctx: BuildContext,
): SelectNode {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const daysPk = `coh_${condIdx}_days`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[daysPk] = cond.time_window_days;

  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const upperBound = resolveDateTo(ctx);
  const upperSql = compileExprToSql(upperBound).sql;

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`event_name = {${eventPk}:String}`),
      raw(`timestamp <= ${upperSql}`),
      filterExpr,
    )
    .groupBy(raw('person_id'))
    .having(raw(`min(timestamp) >= ${upperSql} - INTERVAL {${daysPk}:UInt32} DAY`))
    .build();
}
