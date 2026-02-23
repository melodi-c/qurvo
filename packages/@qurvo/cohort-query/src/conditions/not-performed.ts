import type { CohortNotPerformedEventCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClauses } from '../helpers';
import type { BuildContext } from '../types';

export function buildNotPerformedEventSubquery(
  cond: CohortNotPerformedEventCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const daysPk = `coh_${condIdx}_days`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[daysPk] = cond.time_window_days;

  const filterClause = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);

  return `
    SELECT DISTINCT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE project_id = {${ctx.projectIdParam}:UUID}
      AND ${RESOLVED_PERSON} NOT IN (
        SELECT ${RESOLVED_PERSON}
        FROM events FINAL
        WHERE
          project_id = {${ctx.projectIdParam}:UUID}
          AND event_name = {${eventPk}:String}
          AND timestamp >= now() - INTERVAL {${daysPk}:UInt32} DAY${filterClause}
      )`;
}
