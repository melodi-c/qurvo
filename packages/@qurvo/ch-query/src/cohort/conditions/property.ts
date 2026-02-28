import type { CohortPropertyCondition } from '@qurvo/db';
import type { SelectNode } from '../../ast';
import { select, raw, lte } from '../../builders';
import { RESOLVED_PERSON, resolvePropertyExpr, buildOperatorClause, resolveDateTo } from '../helpers';
import type { BuildContext } from '../types';

export function buildPropertyConditionSubquery(
  cond: CohortPropertyCondition,
  ctx: BuildContext,
): SelectNode {
  const condIdx = ctx.counter.value++;
  const pk = `coh_${condIdx}_v`;
  const latestExpr = resolvePropertyExpr(cond.property);
  const havingExpr = buildOperatorClause(latestExpr, cond.operator, pk, ctx.queryParams, cond.value, cond.values);
  const upperBound = resolveDateTo(ctx);

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      lte(raw('timestamp'), upperBound),
    )
    .groupBy(raw('person_id'))
    .having(havingExpr)
    .build();
}
