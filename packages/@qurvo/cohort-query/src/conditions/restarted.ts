import type { CohortRestartedPerformingCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, rawWithParams, col, namedParam, eq, gte, lte, lt, sub, notInSubquery, inSubquery } from '@qurvo/ch-query';
import { RESOLVED_PERSON, buildEventFilterClauses, allocCondIdx, resolveDateTo } from '../helpers';
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

  const { condIdx, eventPk } = allocCondIdx(ctx);
  const recentPk = `coh_${condIdx}_recent`;
  const histPk = `coh_${condIdx}_hist`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[recentPk] = cond.recent_window_days;
  ctx.queryParams[histPk] = cond.historical_window_days;

  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);
  const upperBound = resolveDateTo(ctx);

  const gapStartPk = `coh_${condIdx}_gapStart`;
  const gapEndPk = `coh_${condIdx}_gapEnd`;

  ctx.queryParams[gapStartPk] = cond.recent_window_days + cond.gap_window_days;
  ctx.queryParams[gapEndPk] = cond.recent_window_days;

  const histInterval = rawWithParams(`INTERVAL {${histPk}:UInt32} DAY`, { [histPk]: cond.historical_window_days });
  const recentInterval = rawWithParams(`INTERVAL {${recentPk}:UInt32} DAY`, { [recentPk]: cond.recent_window_days });
  const gapStartInterval = rawWithParams(`INTERVAL {${gapStartPk}:UInt32} DAY`, { [gapStartPk]: cond.recent_window_days + cond.gap_window_days });
  const gapEndInterval = rawWithParams(`INTERVAL {${gapEndPk}:UInt32} DAY`, { [gapEndPk]: cond.recent_window_days });
  const projectIdExpr = namedParam(ctx.projectIdParam, 'UUID', ctx.queryParams[ctx.projectIdParam]);
  const eventNameExpr = namedParam(eventPk, 'String', cond.event_name);

  // Historical performers (far past)
  const historicalSelect = select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      eq(col('project_id'), projectIdExpr),
      eq(col('event_name'), eventNameExpr),
      gte(col('timestamp'), sub(upperBound, histInterval)),
      lt(col('timestamp'), sub(upperBound, gapStartInterval)),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .build();

  // Gap performers (should NOT have performed during gap)
  const gapSelect = select(raw(RESOLVED_PERSON))
    .from('events')
    .where(
      eq(col('project_id'), projectIdExpr),
      eq(col('event_name'), eventNameExpr),
      gte(col('timestamp'), sub(upperBound, gapStartInterval)),
      lt(col('timestamp'), sub(upperBound, gapEndInterval)),
      filterExpr,
    )
    .build();

  // Recent performers (must have performed recently)
  const recentSelect = select(raw(RESOLVED_PERSON))
    .from('events')
    .where(
      eq(col('project_id'), projectIdExpr),
      eq(col('event_name'), eventNameExpr),
      gte(col('timestamp'), sub(upperBound, recentInterval)),
      lte(col('timestamp'), upperBound),
      filterExpr,
    )
    .build();

  // Outer: historical persons NOT IN gap AND IN recent
  return select(col('person_id'))
    .from(historicalSelect)
    .where(
      notInSubquery(col('person_id'), gapSelect),
      inSubquery(col('person_id'), recentSelect),
    )
    .build();
}
