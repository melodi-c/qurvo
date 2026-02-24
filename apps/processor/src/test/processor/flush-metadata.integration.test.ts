import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ContainerContext, TestProject } from '@qurvo/testing';
import { getTestContext } from '../context';
import {
  REDIS_STREAM_EVENTS,
  writeEventToStream,
  waitForEventByBatchId,
  flushBuffer,
} from '../helpers';

const REDIS_CONSUMER_GROUP = 'processor-group';

let ctx: ContainerContext;
let processorApp: INestApplicationContext;
let testProject: TestProject;

beforeAll(async () => {
  const tc = await getTestContext();
  ctx = tc.ctx;
  processorApp = tc.app;
  testProject = tc.testProject;
}, 120_000);

beforeEach(async () => {
  await flushBuffer(processorApp);
});

describe('flush and metadata cache invalidation', () => {
  it('batch flush + PEL empty after processing', async () => {
    const projectId = testProject.projectId;
    const batchSize = 5;
    const batchId = randomUUID();

    for (let i = 0; i < batchSize; i++) {
      await writeEventToStream(ctx.redis, projectId, {
        distinct_id: `flush-test-${i}-${batchId}`,
        event_name: 'flush_test_event',
        batch_id: batchId,
      });
    }

    await waitForEventByBatchId(ctx.ch, projectId, batchId, { minCount: batchSize });

    const result = await ctx.ch.query({
      query: `SELECT count() AS cnt FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ cnt: string }>();
    expect(Number(rows[0].cnt)).toBe(batchSize);

    // PEL should be empty (all messages ACKed) — poll because XACK is async in consumer loop
    const pelDeadline = Date.now() + 5_000;
    let totalPending = -1;
    while (Date.now() < pelDeadline) {
      const pendingInfo = await ctx.redis.xpending(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP);
      totalPending = Number(pendingInfo[0]);
      if (totalPending === 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(totalPending).toBe(0);
  });

  it('new event_name invalidates event_names cache', async () => {
    const projectId = testProject.projectId;
    const cacheKey = `event_names:${projectId}`;
    const newEventName = `brand_new_event_${randomUUID()}`;
    const batchId = randomUUID();

    // Pre-seed cache key
    await ctx.redis.set(cacheKey, 'cached_value');

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: `cache-inv-${randomUUID()}`,
      event_name: newEventName,
      batch_id: batchId,
    });

    // Wait for OUR specific event to be flushed
    await waitForEventByBatchId(ctx.ch, projectId, batchId);

    const exists = await ctx.redis.exists(cacheKey);
    expect(exists).toBe(0);
  });

  it('repeat event_name — no invalidation', async () => {
    const projectId = testProject.projectId;
    const knownEventName = `known_event_${randomUUID()}`;
    const cacheKey = `event_names:${projectId}`;

    // Pre-seed known_event_names SET with the event name
    await ctx.redis.sadd(`known_event_names:${projectId}`, knownEventName);

    // Send first event so the processor sees this name
    const batchId1 = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: `no-inv-${randomUUID()}`,
      event_name: knownEventName,
      batch_id: batchId1,
    });
    await waitForEventByBatchId(ctx.ch, projectId, batchId1);

    // Now set the cache key
    await ctx.redis.set(cacheKey, 'cached_value');

    // Send another event with same known name
    const batchId2 = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: `no-inv-2-${randomUUID()}`,
      event_name: knownEventName,
      batch_id: batchId2,
    });
    await waitForEventByBatchId(ctx.ch, projectId, batchId2);

    // Cache key should still exist (not invalidated)
    const exists = await ctx.redis.exists(cacheKey);
    expect(exists).toBe(1);
  });

  it('new property keys invalidate event_property_names cache', async () => {
    const projectId = testProject.projectId;
    const cacheKey = `event_property_names:${projectId}`;
    const newPropKey = `revenue_${randomUUID().slice(0, 8)}`;
    const batchId = randomUUID();

    // Pre-seed cache key
    await ctx.redis.set(cacheKey, 'cached_value');

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: `prop-inv-${randomUUID()}`,
      event_name: 'purchase',
      properties: JSON.stringify({ [newPropKey]: 99 }),
      batch_id: batchId,
    });

    // Give consumer loop time to read the event into the buffer
    await new Promise((r) => setTimeout(r, 500));

    // Manually flush — this runs invalidateMetadataCaches synchronously in our call
    await flushBuffer(processorApp);

    // Wait for event in CH (insert may be async)
    await waitForEventByBatchId(ctx.ch, projectId, batchId, { timeoutMs: 10_000 });

    // Poll: the manual flush already ran invalidation, but allow for timer-driven flush too
    const deadline = Date.now() + 10_000;
    let exists = 1;
    while (Date.now() < deadline) {
      exists = await ctx.redis.exists(cacheKey);
      if (exists === 0) break;
      await flushBuffer(processorApp);
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(exists).toBe(0);
  });
});
