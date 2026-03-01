import type { CohortFirstTimeEventCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, rawWithParams, col, namedParam, eq, lte, gte, sub, func } from '@qurvo/ch-query';
import { RESOLVED_PERSON, buildEventFilterClauses, allocCondIdx, resolveDateTo } from '../helpers';
import type { BuildContext } from '../types';

export function buildFirstTimeEventSubquery(
  cond: CohortFirstTimeEventCondition,
  ctx: BuildContext,
): SelectNode {
  const { condIdx, eventPk, daysPk } = allocCondIdx(ctx);

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[daysPk] = cond.time_window_days;

  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const upperBound = resolveDateTo(ctx);
  const daysInterval = rawWithParams(`INTERVAL {${daysPk}:UInt32} DAY`, { [daysPk]: cond.time_window_days });

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      eq(col('project_id'), namedParam(ctx.projectIdParam, 'UUID', ctx.queryParams[ctx.projectIdParam])),
      eq(col('event_name'), namedParam(eventPk, 'String', cond.event_name)),
      lte(col('timestamp'), upperBound),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .having(gte(func('min', col('timestamp')), sub(upperBound, daysInterval)))
    .build();
}
