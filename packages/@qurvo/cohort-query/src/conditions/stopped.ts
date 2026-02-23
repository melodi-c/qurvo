import type { CohortStoppedPerformingCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClauses } from '../helpers';
import type { BuildContext } from '../types';

export function buildStoppedPerformingSubquery(
  cond: CohortStoppedPerformingCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const recentPk = `coh_${condIdx}_recent`;
  const histPk = `coh_${condIdx}_hist`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[recentPk] = cond.recent_window_days;
  ctx.queryParams[histPk] = cond.historical_window_days;

  const filterClause = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);

  // Historical performers NOT IN recent performers
  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE
      project_id = {${ctx.projectIdParam}:UUID}
      AND event_name = {${eventPk}:String}
      AND timestamp >= now() - INTERVAL {${histPk}:UInt32} DAY
      AND timestamp < now() - INTERVAL {${recentPk}:UInt32} DAY${filterClause}
    GROUP BY person_id
    HAVING person_id NOT IN (
      SELECT ${RESOLVED_PERSON}
      FROM events FINAL
      WHERE
        project_id = {${ctx.projectIdParam}:UUID}
        AND event_name = {${eventPk}:String}
        AND timestamp >= now() - INTERVAL {${recentPk}:UInt32} DAY${filterClause}
    )`;
}
