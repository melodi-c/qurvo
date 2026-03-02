import type { CohortRestartedPerformingCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, col, namedParam, eq, gte, lte, lt, sub, notInSubquery, inSubquery, interval } from '@qurvo/ch-query';
import { resolvedPerson, buildEventFilterClauses, allocCondIdx, resolveDateTo, ctxProjectIdExpr } from '../helpers';
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

  const filterExpr = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`);
  const upperBound = resolveDateTo(ctx);

  const gapStartPk = `coh_${condIdx}_gapStart`;
  const gapEndPk = `coh_${condIdx}_gapEnd`;

  const histInterval = interval(namedParam(histPk, 'UInt32', cond.historical_window_days), 'DAY');
  const recentInterval = interval(namedParam(recentPk, 'UInt32', cond.recent_window_days), 'DAY');
  const gapStartInterval = interval(namedParam(gapStartPk, 'UInt32', cond.recent_window_days + cond.gap_window_days), 'DAY');
  const gapEndInterval = interval(namedParam(gapEndPk, 'UInt32', cond.recent_window_days), 'DAY');
  const eventNameExpr = namedParam(eventPk, 'String', cond.event_name);

  // Historical performers (far past)
  const historicalSelect = select(resolvedPerson().as('person_id'))
    .from('events')
    .where(
      ctxProjectIdExpr(ctx),
      eq(col('event_name'), eventNameExpr),
      gte(col('timestamp'), sub(upperBound, histInterval)),
      lt(col('timestamp'), sub(upperBound, gapStartInterval)),
      filterExpr,
    )
    .groupBy(col('person_id'))
    .build();

  // Gap performers (should NOT have performed during gap)
  const gapSelect = select(resolvedPerson())
    .from('events')
    .where(
      ctxProjectIdExpr(ctx),
      eq(col('event_name'), eventNameExpr),
      gte(col('timestamp'), sub(upperBound, gapStartInterval)),
      lt(col('timestamp'), sub(upperBound, gapEndInterval)),
      filterExpr,
    )
    .build();

  // Recent performers (must have performed recently)
  const recentSelect = select(resolvedPerson())
    .from('events')
    .where(
      ctxProjectIdExpr(ctx),
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
