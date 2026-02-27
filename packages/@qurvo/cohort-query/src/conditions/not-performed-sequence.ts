import type { CohortNotPerformedEventSequenceCondition } from '@qurvo/db';
import { RESOLVED_PERSON, resolveDateTo, resolveDateFrom } from '../helpers';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildNotPerformedEventSequenceSubquery(
  cond: CohortNotPerformedEventSequenceCondition,
  ctx: BuildContext,
): string {
  const { stepIndexExpr, seqMatchExpr, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);

  /**
   * Time-range semantics for the absence check — mirrors not-performed.ts:
   *
   * When both `ctx.dateFrom` and `ctx.dateTo` are set (i.e. the condition is
   * evaluated inside a funnel/trend query), we check absence of the sequence in
   * the *exact analysis window* `[dateFrom, dateTo]`.  This prevents a false
   * exclusion when the user performed the sequence *before* `dateFrom` (outside
   * the analysis period) but the rolling window `[dateTo - N days, dateTo]`
   * would reach that far back and incorrectly exclude the user.
   *
   * Example (lower-bound fix):
   *   Funnel: 01.12 – 31.12   (date_from = 01.12, date_to = 31.12)
   *   Cohort: "did NOT perform signup→purchase in last 90 days"
   *   Rolling window (old): [01.10, 31.12] — user who completed the sequence
   *                         on 15.10 → EXCLUDED (false exclusion)
   *   Fixed window (new):   [01.12, 31.12] — user who completed the sequence
   *                         on 15.10 → INCLUDED
   *
   * When only `ctx.dateTo` is set (or neither, e.g. cohort-worker recomputation),
   * we fall back to the traditional rolling window `[dateTo - N days, dateTo]`
   * (or `[now64(3) - N days, now64(3)]`).
   *
   * The upper bound `timestamp <= upperBound` is always applied so that
   * post-period events (timestamp > dateTo) do not complete the sequence and
   * falsely exclude users from the "not performed" cohort.
   */
  const lowerBoundExpr = lowerBound ?? `${upperBound} - INTERVAL {${daysPk}:UInt32} DAY`;

  // Single scan: persons active in window whose events do NOT match the sequence
  return `
    SELECT person_id
    FROM (
      SELECT
        person_id,
        ${seqMatchExpr} AS seq_match
      FROM (
        SELECT
          ${RESOLVED_PERSON} AS person_id,
          timestamp,
          ${stepIndexExpr} AS step_idx
        FROM events
        WHERE
          project_id = {${ctx.projectIdParam}:UUID}
          AND timestamp >= ${lowerBoundExpr}
          AND timestamp <= ${upperBound}
      )
      WHERE step_idx > 0
      GROUP BY person_id
    )
    WHERE seq_match = 0`;
}
