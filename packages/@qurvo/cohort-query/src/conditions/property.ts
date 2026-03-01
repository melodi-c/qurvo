import type { CohortPropertyCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, col, namedParam, eq, lte } from '@qurvo/ch-query';
import { RESOLVED_PERSON, resolvePropertyExpr, buildOperatorClause, allocCondIdx, resolveDateTo } from '../helpers';
import type { BuildContext } from '../types';

export function buildPropertyConditionSubquery(
  cond: CohortPropertyCondition,
  ctx: BuildContext,
): SelectNode {
  const { condIdx } = allocCondIdx(ctx);
  const pk = `coh_${condIdx}_v`;
  const latestExpr = resolvePropertyExpr(cond.property);
  const havingExpr = buildOperatorClause(latestExpr, cond.operator, pk, ctx.queryParams, cond.value, cond.values);
  const upperBound = resolveDateTo(ctx);

  return select(raw(RESOLVED_PERSON).as('person_id'))
    .from('events')
    .where(
      eq(col('project_id'), namedParam(ctx.projectIdParam, 'UUID', ctx.queryParams[ctx.projectIdParam])),
      lte(col('timestamp'), upperBound),
    )
    .groupBy(col('person_id'))
    .having(havingExpr)
    .build();
}
