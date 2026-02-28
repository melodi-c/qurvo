import type { CohortNotPerformedEventSequenceCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, notInSubquery } from '@qurvo/ch-query';
import { RESOLVED_PERSON, resolveDateTo, resolveDateFrom } from '../helpers';
import { compileExprToSql } from '@qurvo/ch-query';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildNotPerformedEventSequenceSubquery(
  cond: CohortNotPerformedEventSequenceCondition,
  ctx: BuildContext,
): SelectNode {
  const { stepIndexExpr, seqMatchExpr, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const upperSql = compileExprToSql(upperBound).sql;

  const rollingLower = `${upperSql} - INTERVAL {${daysPk}:UInt32} DAY`;

  if (lowerBound) {
    const lowerSql = compileExprToSql(lowerBound).sql;

    // Active persons in the rolling window
    const activePersons = select(raw(RESOLVED_PERSON).as('person_id'))
      .from('events')
      .where(
        raw(`project_id = {${ctx.projectIdParam}:UUID}`),
        raw(`timestamp >= ${rollingLower}`),
        raw(`timestamp <= ${upperSql}`),
      )
      .build();

    // Sequence completion check restricted to [dateFrom, dateTo]
    const innerEvents = select(
      raw(RESOLVED_PERSON).as('person_id'),
      raw('timestamp'),
      raw(`${stepIndexExpr}`).as('step_idx'),
    )
      .from('events')
      .where(
        raw(`project_id = {${ctx.projectIdParam}:UUID}`),
        raw(`timestamp >= ${lowerSql}`),
        raw(`timestamp <= ${upperSql}`),
      )
      .build();

    const seqCompleted = select(
      raw('person_id'),
      raw(`${seqMatchExpr}`).as('seq_match'),
    )
      .from(innerEvents)
      .where(raw('step_idx > 0'))
      .groupBy(raw('person_id'))
      .build();

    const completedPersons = select(raw('person_id'))
      .from(seqCompleted)
      .where(raw('seq_match = 1'))
      .build();

    // Two-window NOT IN: active persons who did NOT complete the sequence in [dateFrom, dateTo]
    return select(raw('DISTINCT person_id'))
      .from(activePersons)
      .where(notInSubquery(raw('person_id'), completedPersons))
      .build();
  }

  // Single scan: persons active in window whose events do NOT match the sequence
  const innerSelect = select(
    raw(RESOLVED_PERSON).as('person_id'),
    raw('timestamp'),
    raw(`${stepIndexExpr}`).as('step_idx'),
  )
    .from('events')
    .where(
      raw(`project_id = {${ctx.projectIdParam}:UUID}`),
      raw(`timestamp >= ${rollingLower}`),
      raw(`timestamp <= ${upperSql}`),
    )
    .build();

  const middleSelect = select(
    raw('person_id'),
    raw(`${seqMatchExpr}`).as('seq_match'),
  )
    .from(innerSelect)
    .where(raw('step_idx > 0'))
    .groupBy(raw('person_id'))
    .build();

  return select(raw('person_id'))
    .from(middleSelect)
    .where(raw('seq_match = 0'))
    .build();
}
