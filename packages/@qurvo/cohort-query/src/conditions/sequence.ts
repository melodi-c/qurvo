import type { CohortEventSequenceCondition } from '@qurvo/db';
import { RESOLVED_PERSON, resolveDateTo } from '../helpers';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildEventSequenceSubquery(
  cond: CohortEventSequenceCondition,
  ctx: BuildContext,
): string {
  const { pattern, stepConditions, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);

  return `
    SELECT person_id
    FROM (
      SELECT
        ${RESOLVED_PERSON} AS person_id,
        sequenceMatch('${pattern}')(
          toDateTime(timestamp),
          ${stepConditions.join(',\n          ')}
        ) AS seq_match
      FROM events
      WHERE
        project_id = {${ctx.projectIdParam}:UUID}
        AND timestamp >= ${upperBound} - INTERVAL {${daysPk}:UInt32} DAY
        AND timestamp <= ${upperBound}
      GROUP BY person_id
    )
    WHERE seq_match = 1`;
}
