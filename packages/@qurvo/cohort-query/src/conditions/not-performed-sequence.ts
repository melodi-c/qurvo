import type { CohortNotPerformedEventSequenceCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, rawWithParams, col, gte, lte, sub, notInSubquery } from '@qurvo/ch-query';
import { RESOLVED_PERSON, resolveDateTo, resolveDateFrom, ctxProjectIdExpr } from '../helpers';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildNotPerformedEventSequenceSubquery(
  cond: CohortNotPerformedEventSequenceCondition,
  ctx: BuildContext,
): SelectNode {
  const { stepIndexExpr, seqMatchExpr, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const daysInterval = rawWithParams(`INTERVAL {${daysPk}:UInt32} DAY`, { [daysPk]: cond.time_window_days });

  const rollingLower = sub(upperBound, daysInterval);

  if (lowerBound) {
    // Active persons in the rolling window
    const activePersons = select(raw(RESOLVED_PERSON).as('person_id'))
      .from('events')
      .where(
        ctxProjectIdExpr(ctx),
        gte(col('timestamp'), rollingLower),
        lte(col('timestamp'), upperBound),
      )
      .build();

    // Sequence completion check restricted to [dateFrom, dateTo]
    const innerEvents = select(
      raw(RESOLVED_PERSON).as('person_id'),
      col('timestamp'),
      raw(`${stepIndexExpr}`).as('step_idx'),
    )
      .from('events')
      .where(
        ctxProjectIdExpr(ctx),
        gte(col('timestamp'), lowerBound),
        lte(col('timestamp'), upperBound),
      )
      .build();

    const seqCompleted = select(
      col('person_id'),
      raw(`${seqMatchExpr}`).as('seq_match'),
    )
      .from(innerEvents)
      .where(raw('step_idx > 0'))
      .groupBy(col('person_id'))
      .build();

    const completedPersons = select(col('person_id'))
      .from(seqCompleted)
      .where(raw('seq_match = 1'))
      .build();

    // Two-window NOT IN: active persons who did NOT complete the sequence in [dateFrom, dateTo]
    return select(raw('DISTINCT person_id'))
      .from(activePersons)
      .where(notInSubquery(col('person_id'), completedPersons))
      .build();
  }

  // Single scan: persons active in window whose events do NOT match the sequence
  const innerSelect = select(
    raw(RESOLVED_PERSON).as('person_id'),
    col('timestamp'),
    raw(`${stepIndexExpr}`).as('step_idx'),
  )
    .from('events')
    .where(
      ctxProjectIdExpr(ctx),
      gte(col('timestamp'), rollingLower),
      lte(col('timestamp'), upperBound),
    )
    .build();

  const middleSelect = select(
    col('person_id'),
    raw(`${seqMatchExpr}`).as('seq_match'),
  )
    .from(innerSelect)
    .where(raw('step_idx > 0'))
    .groupBy(col('person_id'))
    .build();

  return select(col('person_id'))
    .from(middleSelect)
    .where(raw('seq_match = 0'))
    .build();
}
