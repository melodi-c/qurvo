import type { CohortStoppedPerformingCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, notInSubquery } from '@qurvo/ch-query';
import { RESOLVED_PERSON, buildEventFilterClauses, allocCondIdx, resolveDateTo } from '../helpers';
import { compileExprToSql } from '@qurvo/ch-query';
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
  const upperSql = compileExprToSql(upperBound).sql;

  // Recent performers subquery (to exclude via NOT IN)
  const recentPerformers = select(raw(RESOLVED_PERSON))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`event_name = {${eventPk}:String}`),
      raw(`timestamp >= ${upperSql} - INTERVAL {${recentPk}:UInt32} DAY`),
      raw(`timestamp <= ${upperSql}`),
      filterExpr,
    )
    .build();

  // Historical performers NOT IN recent performers
  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`event_name = {${eventPk}:String}`),
      raw(`timestamp >= ${upperSql} - INTERVAL {${histPk}:UInt32} DAY`),
      raw(`timestamp < ${upperSql} - INTERVAL {${recentPk}:UInt32} DAY`),
      filterExpr,
    )
    .groupBy(raw('person_id'))
    .having(notInSubquery(raw('person_id'), recentPerformers))
    .build();
}
