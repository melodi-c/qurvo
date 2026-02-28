import type { CohortNotPerformedEventCondition } from '@qurvo/db';
import { RESOLVED_PERSON, resolveEventPropertyExprStr, buildOperatorClauseStr, resolveDateToStr, resolveDateFromStr } from '../helpers';
import type { BuildContext } from '../types';

export function buildNotPerformedEventSubquery(
  cond: CohortNotPerformedEventCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const eventPk = `coh_${condIdx}_event`;
  const daysPk = `coh_${condIdx}_days`;

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[daysPk] = cond.time_window_days;

  // Build countIf condition: event_name match + optional filters
  let countIfCond = `event_name = {${eventPk}:String}`;
  if (cond.event_filters && cond.event_filters.length > 0) {
    for (let i = 0; i < cond.event_filters.length; i++) {
      const f = cond.event_filters[i];
      const pk = `coh_${condIdx}_ef${i}`;
      const expr = resolveEventPropertyExprStr(f.property);
      countIfCond += ` AND ${buildOperatorClauseStr(expr, f.operator, pk, ctx.queryParams, f.value, f.values)}`;
    }
  }

  const upperBound = resolveDateToStr(ctx);
  const lowerBound = resolveDateFromStr(ctx);

  /**
   * Time-range semantics for the absence check:
   *
   * The WHERE clause always enforces both a lower bound and an upper bound so
   * that events outside the target window cannot affect the result.
   *
   * When both `ctx.dateFrom` and `ctx.dateTo` are set (i.e. the condition is
   * evaluated inside a funnel/trend query), we check absence of the event in the
   * *exact analysis window* `[dateFrom, dateTo]`.  This prevents a false-negative
   * exclusion when the user performed the event *before* `dateFrom` (outside the
   * analysis period) but the rolling window `[dateTo - N days, dateTo]` would
   * reach that far back and incorrectly exclude the user.
   *
   * Example (lower-bound fix):
   *   Funnel: 01.12 – 31.12   (date_from = 01.12, date_to = 31.12)
   *   Cohort: "did NOT perform checkout in last 90 days"
   *   Rolling window (old): [01.10, 31.12]  — user who checked out 15.10 → EXCLUDED ✗
   *   Fixed window (new):   [01.12, 31.12]  — user who checked out 15.10 → INCLUDED ✓
   *
   * When only `ctx.dateTo` is set (or neither is set, e.g. cohort-worker
   * recomputation or AI tool), we fall back to the traditional rolling window
   * `[dateTo - N days, dateTo]` (or `[now64(3) - N days, now64(3)]`).
   *
   * In both modes the upper bound `timestamp <= upperBound` is now always
   * applied.  Without it, a post-period event (timestamp > dateTo) would enter
   * the countIf aggregate and falsely exclude the user from a
   * `not_performed_event` cohort.
   *
   * Example (upper-bound fix):
   *   dateTo = 2025-01-31, rolling window = [dateTo - 90d, dateTo]
   *   User performed event on 2025-02-15 (> dateTo)
   *   Old behaviour: timestamp >= lower ✓  (upper filter absent) → counted → EXCLUDED ✗
   *   New behaviour: timestamp >= lower AND timestamp <= dateTo → not counted → INCLUDED ✓
   */
  const lowerBoundExpr = lowerBound ?? `${upperBound} - INTERVAL {${daysPk}:UInt32} DAY`;

  // Single-pass countIf: persons active in window but zero matching events
  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events
    WHERE project_id = {${ctx.projectIdParam}:UUID}
      AND timestamp >= ${lowerBoundExpr}
      AND timestamp <= ${upperBound}
    GROUP BY person_id
    HAVING countIf(${countIfCond}) = 0`;
}
