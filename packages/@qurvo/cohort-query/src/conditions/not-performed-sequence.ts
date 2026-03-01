import type { CohortNotPerformedEventSequenceCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, alias, col, gte, lte, sub, notInSubquery, gt, eq, literal, interval, namedParam } from '@qurvo/ch-query';
import { resolvedPerson, resolveDateTo, resolveDateFrom, ctxProjectIdExpr } from '../helpers';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildNotPerformedEventSequenceSubquery(
  cond: CohortNotPerformedEventSequenceCondition,
  ctx: BuildContext,
): SelectNode {
  const { stepIndexExpr, seqMatchExpr, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const daysInterval = interval(namedParam(daysPk, 'UInt32', cond.time_window_days), 'DAY');

  const rollingLower = sub(upperBound, daysInterval);

  if (lowerBound) {
    // Active persons in the rolling window
    const activePersons = select(resolvedPerson().as('person_id'))
      .from('events')
      .where(
        ctxProjectIdExpr(ctx),
        gte(col('timestamp'), rollingLower),
        lte(col('timestamp'), upperBound),
      )
      .build();

    // Sequence completion check restricted to [dateFrom, dateTo]
    const innerEvents = select(
      resolvedPerson().as('person_id'),
      col('timestamp'),
      alias(stepIndexExpr, 'step_idx'),
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
      alias(seqMatchExpr, 'seq_match'),
    )
      .from(innerEvents)
      .where(gt(col('step_idx'), literal(0)))
      .groupBy(col('person_id'))
      .build();

    const completedPersons = select(col('person_id'))
      .from(seqCompleted)
      .where(eq(col('seq_match'), literal(1)))
      .build();

    // Two-window NOT IN: active persons who did NOT complete the sequence in [dateFrom, dateTo]
    return select(col('person_id'))
      .distinct()
      .from(activePersons)
      .where(notInSubquery(col('person_id'), completedPersons))
      .build();
  }

  // Single scan: persons active in window whose events do NOT match the sequence
  const innerSelect = select(
    resolvedPerson().as('person_id'),
    col('timestamp'),
    alias(stepIndexExpr, 'step_idx'),
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
    alias(seqMatchExpr, 'seq_match'),
  )
    .from(innerSelect)
    .where(gt(col('step_idx'), literal(0)))
    .groupBy(col('person_id'))
    .build();

  return select(col('person_id'))
    .from(middleSelect)
    .where(eq(col('seq_match'), literal(0)))
    .build();
}
