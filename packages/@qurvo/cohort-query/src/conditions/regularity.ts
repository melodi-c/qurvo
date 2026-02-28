import type { CohortPerformedRegularlyCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw } from '@qurvo/ch-query';
import { RESOLVED_PERSON, buildEventFilterClauses, allocCondIdx, resolveDateTo } from '../helpers';
import { compileExprToSql } from '@qurvo/ch-query';
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
  const upperSql = compileExprToSql(upperBound).sql;

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`event_name = {${eventPk}:String}`),
      raw(`timestamp >= ${upperSql} - INTERVAL {${windowPk}:UInt32} DAY`),
      raw(`timestamp <= ${upperSql}`),
      filterExpr,
    )
    .groupBy(raw('person_id'))
    .having(raw(`uniqExact(${bucketExpr}) >= {${minPk}:UInt32}`))
    .build();
}
