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
   * Implementation note — two-window NOT IN approach:
   *   When `dateFrom` is provided, the "active persons" scan uses the full
   *   rolling window `[dateTo - N days, dateTo]` so that persons whose events
   *   are entirely before `dateFrom` are still discovered.  The sequence
   *   completion check is then restricted to `[dateFrom, dateTo]`, so events
   *   outside the analysis period cannot falsely complete the sequence.
   *   This mirrors the countIf-based pattern in not-performed.ts: the WHERE
   *   scan is wide, the absence logic is narrow.
   *
   * When only `ctx.dateTo` is set (or neither, e.g. cohort-worker recomputation),
   * we fall back to the traditional rolling window `[dateTo - N days, dateTo]`
   * (or `[now64(3) - N days, now64(3)]`).  In this case both the person scan
   * and the sequence check use the same window, so the simpler single-scan
   * approach (WHERE seq_match = 0) is used.
   *
   * The upper bound `timestamp <= upperBound` is always applied so that
   * post-period events (timestamp > dateTo) do not complete the sequence and
   * falsely exclude users from the "not performed" cohort.
   */
  const rollingLower = `${upperBound} - INTERVAL {${daysPk}:UInt32} DAY`;

  if (lowerBound) {
    // Two-window NOT IN approach: find active persons in the rolling window,
    // exclude those who completed the sequence in [dateFrom, dateTo].
    return `
    SELECT DISTINCT person_id
    FROM (
      SELECT ${RESOLVED_PERSON} AS person_id
      FROM events
      WHERE
        project_id = {${ctx.projectIdParam}:UUID}
        AND timestamp >= ${rollingLower}
        AND timestamp <= ${upperBound}
    )
    WHERE person_id NOT IN (
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
            AND timestamp >= ${lowerBound}
            AND timestamp <= ${upperBound}
        )
        WHERE step_idx > 0
        GROUP BY person_id
      )
      WHERE seq_match = 1
    )`;
  }

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
          AND timestamp >= ${rollingLower}
          AND timestamp <= ${upperBound}
      )
      WHERE step_idx > 0
      GROUP BY person_id
    )
    WHERE seq_match = 0`;
}
