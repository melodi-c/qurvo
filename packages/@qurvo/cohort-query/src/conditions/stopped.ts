import type { CohortStoppedPerformingCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, col, namedParam, eq, gte, lte, lt, sub, notInSubquery, interval } from '@qurvo/ch-query';
import { resolvedPerson, buildEventFilterClauses, allocCondIdx, resolveDateTo, ctxProjectIdExpr } from '../helpers';
import type { BuildContext } from '../types';
import { CohortQueryValidationError } from '../errors';

export function buildStoppedPerformingSubquery(
  cond: CohortStoppedPerformingCondition,
  ctx: BuildContext,
): SelectNode {
  if (cond.recent_window_days >= cond.historical_window_days) {
    throw new CohortQueryValidationError(
      `stopped_performing: recent_window_days (${cond.recent_window_days}) must be less than historical_window_days (${cond.historical_window_days})`,
    );
  }

  const { condIdx, eventPk } = allocCondIdx(ctx);
  const recentPk = `coh_${condIdx}_recent`;
  const histPk = `coh_${condIdx}_hist`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[recentPk] = cond.recent_window_days;
  ctx.queryParams[histPk] = cond.historical_window_days;

  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const upperBound = resolveDateTo(ctx);
  const recentInterval = interval(namedParam(recentPk, 'UInt32', cond.recent_window_days), 'DAY');
  const histInterval = interval(namedParam(histPk, 'UInt32', cond.historical_window_days), 'DAY');
  const eventNameExpr = namedParam(eventPk, 'String', cond.event_name);

  // Recent performers subquery (to exclude via NOT IN)
  const recentPerformers = select(resolvedPerson())
    .from('events')
    .where(
      ctxProjectIdExpr(ctx),
      eq(col('event_name'), eventNameExpr),
      gte(col('timestamp'), sub(upperBound, recentInterval)),
      lte(col('timestamp'), upperBound),
      filterExpr,
    )
    .build();

  // Historical performers NOT IN recent performers
  return select(resolvedPerson().as('person_id'))
    .from('events')
    .where(
      ctxProjectIdExpr(ctx),
      eq(col('event_name'), eventNameExpr),
      gte(col('timestamp'), sub(upperBound, histInterval)),
      lt(col('timestamp'), sub(upperBound, recentInterval)),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .having(notInSubquery(col('person_id'), recentPerformers))
    .build();
}
