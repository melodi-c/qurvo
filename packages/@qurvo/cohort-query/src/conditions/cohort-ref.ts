import type { CohortCohortCondition } from '@qurvo/db';
import type { Expr, SelectNode } from '@qurvo/ch-query';
import { select, raw, col, namedParam, eq, lte, gte, notInSubquery } from '@qurvo/ch-query';
import { RESOLVED_PERSON, allocCondIdx, resolveDateTo, resolveDateFrom, ctxProjectIdExpr } from '../helpers';
import type { BuildContext } from '../types';

export function buildCohortRefConditionSubquery(
  cond: CohortCohortCondition,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): SelectNode {
  const { condIdx } = allocCondIdx(ctx);
  const idPk = `coh_${condIdx}_ref_id`;
  ctx.queryParams[idPk] = cond.cohort_id;

  const isStatic = cond.is_static ?? resolveCohortIsStatic?.(cond.cohort_id) ?? false;
  const table = isStatic ? 'person_static_cohort' : 'cohort_members';

  const memberSelect = select(col('person_id'))
    .from(`${table} FINAL`)
    .where(
      eq(col('cohort_id'), namedParam(idPk, 'UUID', cond.cohort_id)),
      ctxProjectIdExpr(ctx),
    )
    .build();

  if (cond.negated) {
    const upperBound = resolveDateTo(ctx);
    const lowerBound = resolveDateFrom(ctx);

    const whereConditions: (Expr | undefined | false)[] = [
      ctxProjectIdExpr(ctx),
      lte(col('timestamp'), upperBound),
    ];

    if (lowerBound) {
      whereConditions.push(gte(col('timestamp'), lowerBound));
    }

    whereConditions.push(notInSubquery(raw(RESOLVED_PERSON), memberSelect));

    return select(raw(`DISTINCT ${RESOLVED_PERSON}`).as('person_id'))
      .from('events')
      .where(...whereConditions)
      .build();
  }

  return memberSelect;
}
