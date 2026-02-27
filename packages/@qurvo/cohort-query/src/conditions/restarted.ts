import type { CohortRestartedPerformingCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClauses } from '../helpers';
import type { BuildContext } from '../types';

export function buildRestartedPerformingSubquery(
  cond: CohortRestartedPerformingCondition,
  ctx: BuildContext,
): string {
  if (cond.historical_window_days <= cond.recent_window_days + cond.gap_window_days) {
    throw new Error(
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

  const filterClause = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);

  // 3-window approach: historical INTERSECT NOT gap INTERSECT recent
  // Persons who:
  // 1) Performed in historical window (far past)
  // 2) Did NOT perform during gap window (middle)
  // 3) Performed again in recent window (now)
  const gapStartPk = `coh_${condIdx}_gapStart`;
  const gapEndPk = `coh_${condIdx}_gapEnd`;

  ctx.queryParams[gapStartPk] = cond.recent_window_days + cond.gap_window_days;
  ctx.queryParams[gapEndPk] = cond.recent_window_days;

  return `
    SELECT person_id FROM (
      SELECT ${RESOLVED_PERSON} AS person_id
      FROM events
      WHERE
        project_id = {${ctx.projectIdParam}:UUID}
        AND event_name = {${eventPk}:String}
        AND timestamp >= now() - INTERVAL {${histPk}:UInt32} DAY
        AND timestamp < now() - INTERVAL {${gapStartPk}:UInt32} DAY${filterClause}
      GROUP BY person_id
    )
    WHERE person_id NOT IN (
      SELECT ${RESOLVED_PERSON}
      FROM events
      WHERE
        project_id = {${ctx.projectIdParam}:UUID}
        AND event_name = {${eventPk}:String}
        AND timestamp >= now() - INTERVAL {${gapStartPk}:UInt32} DAY
        AND timestamp < now() - INTERVAL {${gapEndPk}:UInt32} DAY${filterClause}
    )
    AND person_id IN (
      SELECT ${RESOLVED_PERSON}
      FROM events
      WHERE
        project_id = {${ctx.projectIdParam}:UUID}
        AND event_name = {${eventPk}:String}
        AND timestamp >= now() - INTERVAL {${recentPk}:UInt32} DAY${filterClause}
    )`;
}
