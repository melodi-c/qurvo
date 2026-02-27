import type { CohortEventSequenceCondition } from '@qurvo/db';
import { RESOLVED_PERSON, resolveDateTo } from '../helpers';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildEventSequenceSubquery(
  cond: CohortEventSequenceCondition,
  ctx: BuildContext,
): string {
  const { stepIndexExpr, seqMatchExpr, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);

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
          AND timestamp >= ${upperBound} - INTERVAL {${daysPk}:UInt32} DAY
          AND timestamp <= ${upperBound}
      )
      WHERE step_idx > 0
      GROUP BY person_id
    )
    WHERE seq_match = 1`;
}
