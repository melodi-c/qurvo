import type { CohortEventSequenceCondition } from '@qurvo/db';
import type { SelectNode } from '../../ast';
import { select, raw } from '../../builders';
import { RESOLVED_PERSON, resolveDateTo } from '../helpers';
import { compileExprToSql } from '../../compiler';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildEventSequenceSubquery(
  cond: CohortEventSequenceCondition,
  ctx: BuildContext,
): SelectNode {
  const { stepIndexExpr, seqMatchExpr, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);
  const upperSql = compileExprToSql(upperBound).sql;

  // Inner: classify events by step index
  const innerSelect = select(
    raw(RESOLVED_PERSON).as('person_id'),
    raw('timestamp'),
    raw(`${stepIndexExpr}`).as('step_idx'),
  )
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`timestamp >= ${upperSql} - INTERVAL {${daysPk}:UInt32} DAY`),
      raw(`timestamp <= ${upperSql}`),
    )
    .build();

  // Middle: filter non-matching events and compute seq_match per person
  const middleSelect = select(
    raw('person_id'),
    raw(`${seqMatchExpr}`).as('seq_match'),
  )
    .from(innerSelect)
    .where(raw('step_idx > 0'))
    .groupBy(raw('person_id'))
    .build();

  // Outer: filter only persons who completed the sequence
  return select(raw('person_id'))
    .from(middleSelect)
    .where(raw('seq_match = 1'))
    .build();
}
