import type { CohortFirstTimeEventCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { col, namedParam, eq, gte, sub, min, interval } from '@qurvo/ch-query';
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
  const daysInterval = interval(namedParam(daysPk, 'UInt32', cond.time_window_days), 'DAY');

  return eventsBaseSelect(ctx, undefined,
      eq(col('event_name'), namedParam(eventPk, 'String', cond.event_name)),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .having(gte(min(col('timestamp')), sub(upperBound, daysInterval)))
    .build();
}
