import type { CohortEventSequenceCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, col, gte, lte, sub, gt, eq, literal, interval, namedParam } from '@qurvo/ch-query';
import { RESOLVED_PERSON, resolveDateTo, ctxProjectIdExpr } from '../helpers';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildEventSequenceSubquery(
  cond: CohortEventSequenceCondition,
  ctx: BuildContext,
): SelectNode {
  const { stepIndexExpr, seqMatchExpr, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);
  const daysInterval = interval(namedParam(daysPk, 'UInt32', cond.time_window_days), 'DAY');

  // Inner: classify events by step index
  // Note: Cannot use eventsBaseSelect here because the SELECT columns are different
  // (timestamp, step_idx instead of just person_id).
  const innerSelect = select(
    raw(RESOLVED_PERSON).as('person_id'),
    col('timestamp'),
    raw(`${stepIndexExpr}`).as('step_idx'),
  )
    .from('events')
    .where(
      ctxProjectIdExpr(ctx),
      gte(col('timestamp'), sub(upperBound, daysInterval)),
      lte(col('timestamp'), upperBound),
    )
    .build();

  // Middle: filter non-matching events and compute seq_match per person
  const middleSelect = select(
    col('person_id'),
    raw(`${seqMatchExpr}`).as('seq_match'),
  )
    .from(innerSelect)
    .where(gt(col('step_idx'), literal(0)))
    .groupBy(col('person_id'))
    .build();

  // Outer: filter only persons who completed the sequence
  return select(col('person_id'))
    .from(middleSelect)
    .where(eq(col('seq_match'), literal(1)))
    .build();
}
