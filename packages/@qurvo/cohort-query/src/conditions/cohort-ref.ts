import type { CohortCohortCondition } from '@qurvo/db';
import type { BuildContext } from '../types';

export function buildCohortRefConditionSubquery(
  cond: CohortCohortCondition,
  ctx: BuildContext,
  resolveCohortIsStatic?: (cohortId: string) => boolean,
): string {
  const condIdx = ctx.counter.value++;
  const idPk = `coh_${condIdx}_ref_id`;
  ctx.queryParams[idPk] = cond.cohort_id;

  const isStatic = resolveCohortIsStatic?.(cond.cohort_id) ?? false;
  const table = isStatic ? 'person_static_cohort' : 'cohort_members';

  const subquery = `
    SELECT person_id FROM ${table} FINAL
    WHERE cohort_id = {${idPk}:UUID} AND project_id = {${ctx.projectIdParam}:UUID}`;

  if (cond.negated) {
    return `
      SELECT DISTINCT ${resolvedPersonSelect()}
      FROM events FINAL
      WHERE project_id = {${ctx.projectIdParam}:UUID}
        AND ${resolvedPersonSelect()} NOT IN (${subquery})`;
  }

  return subquery;
}

function resolvedPersonSelect(): string {
  return `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;
}
