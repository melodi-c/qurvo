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
     * Timestamp bounds for the negated cohort-ref:
     *
     * Without bounds the query scans the entire `events` table for all time,
     * which is both slow and semantically wrong — a user who had events years
     * ago (but none in the current analysis window) would still appear in the
     * negated set, producing incorrect funnel/trend results.
     *
     * When `ctx.dateFrom` and `ctx.dateTo` are set (funnel/trend context) we
     * restrict to the exact `[dateFrom, dateTo]` window, matching the period
     * being analysed.  When only `ctx.dateTo` is set we use `[dateTo - 0d,
     * dateTo]` (effectively dateTo as both bounds), and when neither is set
     * (cohort-worker recomputation) we use `[now64(3) - 0d, now64(3)]` — the
     * bound still prevents full-history scans while keeping the cohort fresh.
     *
     * The lowerBound falls back to upperBound (no rolling window, just the
     * upper boundary) because cohort-ref has no `time_window_days` concept —
     * membership is determined by the cohort table, not by a time window.
     */
    const lowerBoundExpr = lowerBound ?? upperBound;
    return `
      SELECT DISTINCT ${RESOLVED_PERSON} AS person_id
      FROM events
      WHERE project_id = {${ctx.projectIdParam}:UUID}
        AND timestamp >= ${lowerBoundExpr}
        AND timestamp <= ${upperBound}
        AND ${RESOLVED_PERSON} NOT IN (${subquery})`;
  }

  return subquery;
}
