import type { CohortPerformedRegularlyCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClauses, resolveDateTo } from '../helpers';
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
): string {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const windowPk = `coh_${condIdx}_window`;
  const minPk = `coh_${condIdx}_min`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[windowPk] = cond.time_window_days;
  ctx.queryParams[minPk] = cond.min_periods;

  const filterClause = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const bucketExpr = periodBucketExpr(cond.period_type);
  const upperBound = resolveDateTo(ctx);

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events
    WHERE
      project_id = {${ctx.projectIdParam}:UUID}
      AND event_name = {${eventPk}:String}
      AND timestamp >= ${upperBound} - INTERVAL {${windowPk}:UInt32} DAY
      AND timestamp <= ${upperBound}${filterClause}
    GROUP BY person_id
    HAVING uniqExact(${bucketExpr}) >= {${minPk}:UInt32}`;
}
