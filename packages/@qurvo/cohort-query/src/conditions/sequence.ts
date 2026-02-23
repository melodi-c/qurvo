import type { CohortEventSequenceCondition } from '@qurvo/db';
import { RESOLVED_PERSON, buildEventFilterClauses } from '../helpers';
import type { BuildContext } from '../types';

export function buildEventSequenceSubquery(
  cond: CohortEventSequenceCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const daysPk = `coh_${condIdx}_days`;

  ctx.queryParams[daysPk] = cond.time_window_days;

  // Build sequenceMatch pattern: (?1).*(?2).*...
  const patternParts = cond.steps.map((_, i) => `(?${i + 1})`);
  const pattern = patternParts.join('.*');

  // Build condition expressions for each step
  const stepConditions = cond.steps.map((step, i) => {
    const stepEventPk = `coh_${condIdx}_seq_${i}`;
    ctx.queryParams[stepEventPk] = step.event_name;

    let filterExpr = `event_name = {${stepEventPk}:String}`;
    if (step.event_filters && step.event_filters.length > 0) {
      const filterClause = buildEventFilterClauses(step.event_filters, `coh_${condIdx}_s${i}`, ctx.queryParams);
      // Remove leading ' AND '
      filterExpr += filterClause;
    }
    return filterExpr;
  });

  return `
    SELECT person_id
    FROM (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        sequenceMatch('${pattern}')(
          timestamp,
          ${stepConditions.join(',\n          ')}
        ) AS seq_match
      FROM events FINAL
      WHERE
        project_id = {${ctx.projectIdParam}:UUID}
        AND timestamp >= now() - INTERVAL {${daysPk}:UInt32} DAY
      GROUP BY person_id
    )
    WHERE seq_match = 1`;
}
