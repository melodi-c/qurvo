import type { CohortCohortCondition } from '@qurvo/db';
import { RESOLVED_PERSON } from '../helpers';
import type { BuildContext } from '../types';

export function buildCohortRefConditionSubquery(
  cond: CohortCohortCondition,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): string {
  const condIdx = ctx.counter.value++;
  const idPk = `coh_${condIdx}_ref_id`;
  ctx.queryParams[idPk] = cond.cohort_id;

  const isStatic = cond.is_static ?? resolveCohortIsStatic?.(cond.cohort_id) ?? false;
  const table = isStatic ? 'person_static_cohort' : 'cohort_members';

  const subquery = `
    SELECT person_id FROM ${table} FINAL
    WHERE cohort_id = {${idPk}:UUID} AND project_id = {${ctx.projectIdParam}:UUID}`;

  if (cond.negated) {
    return `
      SELECT DISTINCT ${RESOLVED_PERSON} AS person_id
      FROM events
      WHERE project_id = {${ctx.projectIdParam}:UUID}
        AND ${RESOLVED_PERSON} NOT IN (${subquery})`;
  }

  return subquery;
}
