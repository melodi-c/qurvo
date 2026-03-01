import type { CohortCohortCondition } from '@qurvo/db';
import type { Expr, SelectNode } from '@qurvo/ch-query';
import { select, raw, notInSubquery } from '@qurvo/ch-query';
import { RESOLVED_PERSON, allocCondIdx, resolveDateTo, resolveDateFrom } from '../helpers';
import { compileExprToSql } from '@qurvo/ch-query';
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

  const memberSelect = select(raw('person_id'))
    .from(`${table} FINAL`)
    .where(
      raw(`cohort_id = {${idPk}:UUID}`),
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
    )
    .build();

  if (cond.negated) {
    const upperBound = resolveDateTo(ctx);
    const lowerBound = resolveDateFrom(ctx);
    const upperSql = compileExprToSql(upperBound).sql;

    const whereConditions: (Expr | undefined | false)[] = [
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`timestamp <= ${upperSql}`),
    ];

    if (lowerBound) {
      const lowerSql = compileExprToSql(lowerBound).sql;
      whereConditions.push(raw(`timestamp >= ${lowerSql}`));
    }

    whereConditions.push(notInSubquery(raw(RESOLVED_PERSON), memberSelect));

    return select(raw(`DISTINCT ${RESOLVED_PERSON}`).as('person_id'))
      .from('events')
      .where(...whereConditions)
      .build();
  }

  return memberSelect;
}
