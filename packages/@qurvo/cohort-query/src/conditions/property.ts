import type { CohortPropertyCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { col } from '@qurvo/ch-query';
import { resolvePropertyExpr, buildOperatorClause, allocCondIdx, eventsBaseSelect } from '../helpers';
import type { BuildContext } from '../types';

export function buildPropertyConditionSubquery(
  cond: CohortPropertyCondition,
  ctx: BuildContext,
): SelectNode {
  const { condIdx } = allocCondIdx(ctx);
  const pk = `coh_${condIdx}_v`;
  const latestExpr = resolvePropertyExpr(cond.property);
  const havingExpr = buildOperatorClause(latestExpr, cond.operator, pk, ctx.queryParams, cond.value, cond.values);

  return eventsBaseSelect(ctx)
    .groupBy(col('person_id'))
    .having(havingExpr)
    .build();
}
