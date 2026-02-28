import type { QueryNode } from '@qurvo/ch-query';
import { select, raw, param, min, gte, lte, eq } from '@qurvo/ch-query';
import { resolvedPerson } from '../../analytics/query-helpers';

/**
 * Builds a "first event per user" CTE — finds the earliest timestamp of a given
 * event for each user within a date range.
 *
 * Returns a SelectNode that produces columns: `pid`, `start_ts`.
 *
 * Shared by `funnel-gaps.tool.ts` and `time-between-events.tool.ts`.
 */
export function firstEventCte(opts: {
  projectId: string;
  eventName: string;
  from: string;
  to: string;
}): QueryNode {
  return select(
    resolvedPerson().as('pid'),
    min(raw('timestamp')).as('start_ts'),
  )
    .from('events')
    .where(
      eq(raw('project_id'), param('UUID', opts.projectId)),
      eq(raw('event_name'), param('String', opts.eventName)),
      gte(raw('timestamp'), param('DateTime64(3)', opts.from)),
      lte(raw('timestamp'), param('DateTime64(3)', opts.to)),
    )
    .groupBy(raw('pid'))
    .build();
}
