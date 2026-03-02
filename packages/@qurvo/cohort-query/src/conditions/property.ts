import type { CohortPropertyCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { col } from '@qurvo/ch-query';
import { resolvePropertyExpr, applyOperator, allocCondIdx, eventsBaseSelect } from '../helpers';
import type { BuildContext } from '../types';

export function buildPropertyConditionSubquery(
  cond: CohortPropertyCondition,
  ctx: BuildContext,
): SelectNode {
  const { condIdx } = allocCondIdx(ctx);
  const pk = `coh_${condIdx}_v`;
  const latestExpr = resolvePropertyExpr(cond.property);
  const havingExpr = applyOperator(latestExpr, cond.operator, pk, cond.value, cond.values);

  return eventsBaseSelect(ctx)
    .groupBy(col('person_id'))
    .having(havingExpr)
    .build();
}
