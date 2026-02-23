import type { CohortEventCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClauses } from '../helpers';
import type { BuildContext } from '../types';

export function buildEventConditionSubquery(
  cond: CohortEventCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const countPk = `coh_${condIdx}_count`;
  const daysPk = `coh_${condIdx}_days`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[countPk] = cond.count;
  ctx.queryParams[daysPk] = cond.time_window_days;

  let countOp: string;
  switch (cond.count_operator) {
    case 'gte': countOp = '>='; break;
    case 'lte': countOp = '<='; break;
    case 'eq':  countOp = '=';  break;
  }

  const filterClause = buildEventFilterClauses(cond.event_filters, `coh_${condIdx}`, ctx.queryParams);

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE
      project_id = {${ctx.projectIdParam}:UUID}
      AND event_name = {${eventPk}:String}
      AND timestamp >= now() - INTERVAL {${daysPk}:UInt32} DAY${filterClause}
    GROUP BY person_id
    HAVING count() ${countOp} {${countPk}:UInt64}`;
}
