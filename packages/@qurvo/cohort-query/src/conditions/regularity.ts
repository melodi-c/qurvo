import type { CohortPerformedRegularlyCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import type { Expr } from '@qurvo/ch-query';
import { col, namedParam, literal, eq, gte, sub, uniqExact, interval, toStartOfDay, toStartOfWeek, toStartOfMonth } from '@qurvo/ch-query';
import { buildEventFilterClauses, allocCondIdx, resolveDateTo, eventsBaseSelect } from '../helpers';
import type { BuildContext } from '../types';

function periodBucketExpr(periodType: 'day' | 'week' | 'month'): Expr {
  switch (periodType) {
    case 'day':   return toStartOfDay(col('timestamp'));
    case 'week':  return toStartOfWeek(col('timestamp'), literal(1));
    case 'month': return toStartOfMonth(col('timestamp'));
  }
}


export function buildPerformedRegularlySubquery(
  cond: CohortPerformedRegularlyCondition,
  ctx: BuildContext,
): SelectNode {
  const { condIdx, eventPk } = allocCondIdx(ctx);
  const windowPk = `coh_${condIdx}_window`;
  const minPk = `coh_${condIdx}_min`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[windowPk] = cond.time_window_days;
  ctx.queryParams[minPk] = cond.min_periods;

  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const bucketExpr = periodBucketExpr(cond.period_type);
  const upperBound = resolveDateTo(ctx);
  const windowInterval = interval(namedParam(windowPk, 'UInt32', cond.time_window_days), 'DAY');
  const lowerExpr = sub(upperBound, windowInterval);

  return eventsBaseSelect(ctx, lowerExpr,
      eq(col('event_name'), namedParam(eventPk, 'String', cond.event_name)),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .having(gte(uniqExact(bucketExpr), namedParam(minPk, 'UInt32', cond.min_periods)))
    .build();
}
