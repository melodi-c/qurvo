import type { CohortNotPerformedEventCondition } from '@qurvo/db';
import type { SelectNode } from '@qurvo/ch-query';
import { raw } from '@qurvo/ch-query';
import {
  allocCondIdx,
  buildCountIfCondStr,
  buildEventsBaseSelect,
  resolveDateTo,
  resolveDateFrom,
} from '../helpers';
import { compileExprToSql } from '@qurvo/ch-query';
import type { BuildContext } from '../types';

export function buildNotPerformedEventSubquery(
  cond: CohortNotPerformedEventCondition,
  ctx: BuildContext,
): SelectNode {
  const { condIdx, eventPk, daysPk } = allocCondIdx(ctx);

  ctx.queryParams[eventPk] = cond.event_name;
  ctx.queryParams[daysPk] = cond.time_window_days;

  const countIfCond = buildCountIfCondStr(eventPk, condIdx, cond.event_filters, ctx.queryParams);

  const upperBound = resolveDateTo(ctx);
  const lowerBound = resolveDateFrom(ctx);
  const upperSql = compileExprToSql(upperBound).sql;
  const lowerBoundSql = lowerBound
    ? compileExprToSql(lowerBound).sql
    : `${upperSql} - INTERVAL {${daysPk}:UInt32} DAY`;

  return buildEventsBaseSelect(ctx, upperSql, lowerBoundSql)
    .groupBy(raw('person_id'))
    .having(raw(`countIf(${countIfCond}) = 0`))
    .build();
}
