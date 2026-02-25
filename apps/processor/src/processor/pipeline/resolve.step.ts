import type { Event } from '@qurvo/clickhouse';
import type { ValidMessage, BufferedEvent, ResolveResult, ValidatedFields, PipelineContext, EventEnricher } from './types';
import { groupByKey } from '../event-utils';
import { resolvePersonEnricher, geoEnricher, uaEnricher, fieldMapEnricher } from './enrichers';

const ENRICHERS: EventEnricher[] = [resolvePersonEnricher, geoEnricher, uaEnricher, fieldMapEnricher];

/**
 * Step 4: Resolve persons and build Event DTOs.
 * Concurrent across distinct IDs, serial within.
 * Uses allSettled so one failing group doesn't block others —
 * failed groups' messages stay in PEL for XAUTOCLAIM re-delivery.
 */
export async function resolveAndBuildEvents(
  valid: ValidMessage[],
  personCache: Map<string, string>,
  ctx: PipelineContext,
): Promise<ResolveResult> {
  const ctxWithCache: PipelineContext = { ...ctx, personCache };

  const groups = groupByKey(valid, (item) =>
    `${item.fields.project_id}:${item.fields.distinct_id}`,
  );

  const groupEntries = Array.from(groups.values());
  const settled = await Promise.allSettled(
    groupEntries.map(async (group) => {
      const results: BufferedEvent[] = [];
      for (const item of group) {
        results.push({
          messageId: item.id,
          event: await buildEvent(item.fields, ctxWithCache),
        });
      }
      return results;
    }),
  );

  const buffered: BufferedEvent[] = [];
  const failedIds: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      buffered.push(...result.value);
    } else {
      const group = groupEntries[i];
      failedIds.push(...group.map((item) => item.id));
      ctx.logger.error(
        { err: result.reason, groupSize: group.length, distinctId: group[0].fields.distinct_id },
        'Group processing failed — messages stay in PEL for re-delivery',
      );
    }
  }

  return { buffered, failedIds };
}

async function buildEvent(data: ValidatedFields, ctx: PipelineContext): Promise<Event> {
  let event: Partial<Event> = {};
  for (const enrich of ENRICHERS) {
    event = await enrich(data, event, ctx);
  }
  return event as Event;
}
