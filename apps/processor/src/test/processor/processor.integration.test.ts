import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ContainerContext, TestProject } from '@qurvo/testing';
import { getTestContext } from '../context';
import {
  writeEventToStream,
  waitForEventByBatchId,
  flushBuffer,
} from '../helpers';

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

describe('event processing: Redis stream → ClickHouse', () => {
  it('processes a single event and writes it to ClickHouse', async () => {
    const projectId = testProject.projectId;
    const distinctId = `proc-user-${randomUUID()}`;
    const batchId = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: distinctId,
      event_name: 'checkout',
      batch_id: batchId,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId);

    const result = await ctx.ch.query({
      query: 'SELECT event_name, distinct_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}',
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ event_name: string; distinct_id: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].event_name).toBe('checkout');
    expect(rows[0].distinct_id).toBe(distinctId);
  });

  it('processes a batch of events and all appear in ClickHouse', async () => {
    const projectId = testProject.projectId;
    const batchSize = 5;
    const batchId = randomUUID();

    for (let i = 0; i < batchSize; i++) {
      await writeEventToStream(ctx.redis, projectId, {
        distinct_id: `batch-proc-${i}-${batchId}`,
        event_name: 'batch_test_event',
        batch_id: batchId,
      });
    }

    await waitForEventByBatchId(ctx.ch, projectId, batchId, { minCount: batchSize });

    const result = await ctx.ch.query({
      query: 'SELECT count() AS cnt FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}',
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ cnt: string }>();
    expect(Number(rows[0].cnt)).toBe(batchSize);
  });

  it('assigns person_id to events', async () => {
    const projectId = testProject.projectId;
    const distinctId = `person-test-${randomUUID()}`;
    const batchId = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: distinctId,
      event_name: 'page_view',
      batch_id: batchId,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId);

    const result = await ctx.ch.query({
      query: 'SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}',
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ person_id: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('$identify event processing', () => {
  it('processes $identify and writes both events to ClickHouse', async () => {
    const projectId = testProject.projectId;
    const userId = `real-user-${randomUUID()}`;
    const anonId = `anon-${randomUUID()}`;
    const batchId1 = randomUUID();
    const batchId2 = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: anonId,
      event_name: 'page_view',
      anonymous_id: anonId,
      batch_id: batchId1,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId1);

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: anonId,
      event_type: 'identify',
      batch_id: batchId2,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId2);

    const result = await ctx.ch.query({
      query: `SELECT event_name, distinct_id FROM events FINAL
              WHERE project_id = {p:UUID} AND distinct_id IN ({ids:Array(String)})`,
      query_params: { p: projectId, ids: [anonId, userId] },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ event_name: string; distinct_id: string }>();
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
