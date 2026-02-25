import type { CohortNotPerformedEventCondition } from '@qurvo/db';
import { RESOLVED_PERSON, resolveEventPropertyExpr, buildOperatorClause } from '../helpers';
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

  // Build countIf condition: event_name match + optional filters
  let countIfCond = `event_name = {${eventPk}:String}`;
  if (cond.event_filters && cond.event_filters.length > 0) {
    for (let i = 0; i < cond.event_filters.length; i++) {
      const f = cond.event_filters[i];
      const pk = `coh_${condIdx}_ef${i}`;
      const expr = resolveEventPropertyExpr(f.property);
      countIfCond += ` AND ${buildOperatorClause(expr, f.operator, pk, ctx.queryParams, f.value, f.values)}`;
    }
  }

  // Single-pass countIf: persons active in window but zero matching events
  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events
    WHERE project_id = {${ctx.projectIdParam}:UUID}
      AND timestamp >= now() - INTERVAL {${daysPk}:UInt32} DAY
    GROUP BY person_id
    HAVING countIf(${countIfCond}) = 0`;
}
