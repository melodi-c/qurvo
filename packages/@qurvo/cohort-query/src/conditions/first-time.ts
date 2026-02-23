import type { CohortFirstTimeEventCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClauses } from '../helpers';
import type { BuildContext } from '../types';

export function buildFirstTimeEventSubquery(
  cond: CohortFirstTimeEventCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const daysPk = `coh_${condIdx}_days`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[daysPk] = cond.time_window_days;

  const filterClause = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE
      project_id = {${ctx.projectIdParam}:UUID}
      AND event_name = {${eventPk}:String}${filterClause}
    GROUP BY person_id
    HAVING min(timestamp) >= now() - INTERVAL {${daysPk}:UInt32} DAY`;
}
