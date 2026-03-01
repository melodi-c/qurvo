import type { CohortEventSequenceCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { select, raw, rawWithParams, col, gte, lte, sub } from '@qurvo/ch-query';
import { RESOLVED_PERSON, resolveDateTo, ctxProjectIdExpr } from '../helpers';
import type { BuildContext } from '../types';
import { buildSequenceCore } from './sequence-core';

export function buildEventSequenceSubquery(
  cond: CohortEventSequenceCondition,
  ctx: BuildContext,
): SelectNode {
  const { stepIndexExpr, seqMatchExpr, daysPk } = buildSequenceCore(cond, ctx);
  const upperBound = resolveDateTo(ctx);
  const daysInterval = rawWithParams(`INTERVAL {${daysPk}:UInt32} DAY`, { [daysPk]: cond.time_window_days });

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
    .where(raw('step_idx > 0'))
    .groupBy(col('person_id'))
    .build();

  // Outer: filter only persons who completed the sequence
  return select(col('person_id'))
    .from(middleSelect)
    .where(raw('seq_match = 1'))
    .build();
}
