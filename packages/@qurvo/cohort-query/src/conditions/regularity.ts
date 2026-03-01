import type { CohortPerformedRegularlyCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, rawWithParams, col, namedParam, eq, gte, lte, sub, uniqExact } from '@qurvo/ch-query';
import { RESOLVED_PERSON, buildEventFilterClauses, allocCondIdx, resolveDateTo } from '../helpers';
import type { BuildContext } from '../types';

function periodBucketExpr(periodType: 'day' | 'week' | 'month'): string {
  switch (periodType) {
    case 'day':   return 'toStartOfDay(timestamp)';
    case 'week':  return 'toStartOfWeek(timestamp, 1)';
    case 'month': return 'toStartOfMonth(timestamp)';
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
  const windowInterval = rawWithParams(`INTERVAL {${windowPk}:UInt32} DAY`, { [windowPk]: cond.time_window_days });

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      eq(col('project_id'), namedParam(ctx.projectIdParam, 'UUID', ctx.queryParams[ctx.projectIdParam])),
      eq(col('event_name'), namedParam(eventPk, 'String', cond.event_name)),
      gte(col('timestamp'), sub(upperBound, windowInterval)),
      lte(col('timestamp'), upperBound),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .having(gte(uniqExact(raw(bucketExpr)), namedParam(minPk, 'UInt32', cond.min_periods)))
    .build();
}
