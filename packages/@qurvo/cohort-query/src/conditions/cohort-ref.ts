import type { CohortCohortCondition } from '@qurvo/db';
import { RESOLVED_PERSON, resolveDateTo, resolveDateFrom } from '../helpers';
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
    const upperBound = resolveDateTo(ctx);
    const lowerBound = resolveDateFrom(ctx);
    /**
     * Negated cohort-ref: return all persons in the project who are NOT members
     * of the referenced cohort.
     *
     * The outer SELECT enumerates persons from the `events` table; the inner
     * NOT IN subquery checks the cohort_members / person_static_cohort table.
     *
     * Timestamp bounds scope the outer scan:
     *   - When both `dateFrom` and `dateTo` are set (funnel/trend context) we
     *     restrict to the exact `[dateFrom, dateTo]` window, matching the
     *     period being analysed.
     *   - When only `dateTo` is set we restrict `timestamp <= dateTo` without
     *     a lower bound — the caller wants "up to dateTo" semantics.
     *   - When neither is set (cohort-worker recomputation, countCohortMembers)
     *     we use `timestamp <= now64(3)` without a lower bound so that ALL
     *     persons in the project are considered.
     *
     * The previous logic fell back `lowerBound ?? upperBound`, creating a
     * degenerate `[now, now]` window that captured zero events and always
     * returned 0 persons.  Cohort-ref membership is determined by the cohort
     * table, not by a time window, so a lower bound is only applied when
     * explicitly provided via `ctx.dateFrom`.
     */
    const lowerClause = lowerBound ? `AND timestamp >= ${lowerBound}` : '';
    return `
      SELECT DISTINCT ${RESOLVED_PERSON} AS person_id
      FROM events
      WHERE project_id = {${ctx.projectIdParam}:UUID}
        AND timestamp <= ${upperBound}
        ${lowerClause}
        AND ${RESOLVED_PERSON} NOT IN (${subquery})`;
  }

  return subquery;
}
