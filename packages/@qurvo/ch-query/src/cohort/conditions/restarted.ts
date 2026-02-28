import type { CohortRestartedPerformingCondition } from '@qurvo/db';
import type { SelectNode } from '../../ast';
import { select, raw, notInSubquery, inSubquery, and } from '../../builders';
import { RESOLVED_PERSON, buildEventFilterClauses, resolveDateTo } from '../helpers';
import { compileExprToSql } from '../../compiler';
import type { BuildContext } from '../types';
import { CohortQueryValidationError } from '../errors';

export function buildRestartedPerformingSubquery(
  cond: CohortRestartedPerformingCondition,
  ctx: BuildContext,
): SelectNode {
  if (cond.historical_window_days <= cond.recent_window_days + cond.gap_window_days) {
    throw new CohortQueryValidationError(
      `restarted_performing: historical_window_days (${cond.historical_window_days}) must be greater than recent_window_days (${cond.recent_window_days}) + gap_window_days (${cond.gap_window_days})`,
    );
  }

  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const recentPk = `coh_${condIdx}_recent`;
  const histPk = `coh_${condIdx}_hist`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[recentPk] = cond.recent_window_days;
  ctx.queryParams[histPk] = cond.historical_window_days;

  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const upperBound = resolveDateTo(ctx);
  const upperSql = compileExprToSql(upperBound).sql;

  const gapStartPk = `coh_${condIdx}_gapStart`;
  const gapEndPk = `coh_${condIdx}_gapEnd`;

  ctx.queryParams[gapStartPk] = cond.recent_window_days + cond.gap_window_days;
  ctx.queryParams[gapEndPk] = cond.recent_window_days;

  // Historical performers (far past)
  const historicalSelect = select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`event_name = {${eventPk}:String}`),
      raw(`timestamp >= ${upperSql} - INTERVAL {${histPk}:UInt32} DAY`),
      raw(`timestamp < ${upperSql} - INTERVAL {${gapStartPk}:UInt32} DAY`),
      filterExpr,
    )
    .groupBy(raw('person_id'))
    .build();

  // Gap performers (should NOT have performed during gap)
  const gapSelect = select(raw(RESOLVED_PERSON))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`event_name = {${eventPk}:String}`),
      raw(`timestamp >= ${upperSql} - INTERVAL {${gapStartPk}:UInt32} DAY`),
      raw(`timestamp < ${upperSql} - INTERVAL {${gapEndPk}:UInt32} DAY`),
      filterExpr,
    )
    .build();

  // Recent performers (must have performed recently)
  const recentSelect = select(raw(RESOLVED_PERSON))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`event_name = {${eventPk}:String}`),
      raw(`timestamp >= ${upperSql} - INTERVAL {${recentPk}:UInt32} DAY`),
      raw(`timestamp <= ${upperSql}`),
      filterExpr,
    )
    .build();

  // Outer: historical persons NOT IN gap AND IN recent
  return select(raw('person_id'))
    .from(historicalSelect)
    .where(
      notInSubquery(raw('person_id'), gapSelect),
      inSubquery(raw('person_id'), recentSelect),
    )
    .build();
}
