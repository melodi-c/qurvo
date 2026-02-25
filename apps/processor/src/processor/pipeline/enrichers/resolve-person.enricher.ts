import type { Event } from '@qurvo/clickhouse';
import type { EventEnricher } from '../types';

/**
 * Resolves the person_id for the event and enqueues person data into the batch store.
 * Handles both regular events (resolve by distinct_id) and $identify events (merge anonymous +
 * known person). Reads from ctx.personCache (populated by the prefetch step).
 */
export const resolvePersonEnricher: EventEnricher = async (data, event, ctx) => {
  const cache = ctx.personCache ?? new Map<string, string>();

  let personId: string;
  let mergedFromPersonId: string | null = null;

  if (data.event_name === '$identify' && data.anonymous_id) {
    const result = await ctx.personResolver.handleIdentify(
      data.project_id,
      data.distinct_id,
      data.anonymous_id,
      cache,
    );
    personId = result.personId;
    mergedFromPersonId = result.mergedFromPersonId;
  } else {
    personId = await ctx.personResolver.resolve(data.project_id, data.distinct_id, cache);
  }

  ctx.personBatchStore.enqueue(data.project_id, personId, data.distinct_id, data.user_properties || '{}');
  if (mergedFromPersonId) {
    ctx.personBatchStore.enqueueMerge(data.project_id, mergedFromPersonId, personId);
  }

  return { ...event, person_id: personId } satisfies Partial<Event>;
};
