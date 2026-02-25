import type { CohortEventSequenceCondition } from '@qurvo/db';
import { RESOLVED_PERSON } from '../helpers';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildEventSequenceSubquery(
  cond: CohortEventSequenceCondition,
  ctx: BuildContext,
): string {
  const { pattern, stepConditions, daysPk } = buildSequenceCore(cond, ctx);

  return `
    SELECT person_id
    FROM (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        sequenceMatch('${pattern}')(
          timestamp,
          ${stepConditions.join(',\n          ')}
        ) AS seq_match
      FROM events FINAL
      WHERE
        project_id = {${ctx.projectIdParam}:UUID}
        AND timestamp >= now() - INTERVAL {${daysPk}:UInt32} DAY
      GROUP BY person_id
    )
    WHERE seq_match = 1`;
}
