import type { CohortFirstTimeEventCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { rawWithParams, col, namedParam, eq, gte, sub, func } from '@qurvo/ch-query';
import { buildEventFilterClauses, allocCondIdx, resolveDateTo, eventsBaseSelect } from '../helpers';
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

  return eventsBaseSelect(ctx, undefined,
      eq(col('event_name'), namedParam(eventPk, 'String', cond.event_name)),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .having(gte(func('min', col('timestamp')), sub(upperBound, daysInterval)))
    .build();
}
