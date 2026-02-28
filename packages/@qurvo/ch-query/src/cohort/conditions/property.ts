import type { CohortPropertyCondition } from '@qurvo/db';
import { RESOLVED_PERSON, resolvePropertyExprStr, buildOperatorClauseStr, resolveDateToStr } from '../helpers';
import type { BuildContext } from '../types';

export function buildPropertyConditionSubquery(
  cond: CohortPropertyCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const pk = `coh_${condIdx}_v`;
  const latestExpr = resolvePropertyExprStr(cond.property);
  const havingClause = buildOperatorClauseStr(latestExpr, cond.operator, pk, ctx.queryParams, cond.value, cond.values);
  const upperBound = resolveDateToStr(ctx);

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events
    WHERE project_id = {${ctx.projectIdParam}:UUID}
      AND timestamp <= ${upperBound}
    GROUP BY person_id
    HAVING ${havingClause}`;
}
