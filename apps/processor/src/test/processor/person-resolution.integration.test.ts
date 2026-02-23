import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ContainerContext, TestProject } from '@qurvo/testing';
import { getTestContext } from '../context';
import {
  writeEventToStream,
  waitForEventByBatchId,
  waitForDistinctIdMapping,
  getOverrides,
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

describe('person resolution', () => {
  it('same distinct_id → same person_id', async () => {
    const projectId = testProject.projectId;
    const distinctId = `same-person-${randomUUID()}`;
    const batchId = randomUUID();

    for (let i = 0; i < 3; i++) {
      await writeEventToStream(ctx.redis, projectId, {
        distinct_id: distinctId,
        event_name: `evt_${i}`,
        batch_id: batchId,
      });
    }

    await waitForEventByBatchId(ctx.ch, projectId, batchId, { minCount: 3 });

    const result = await ctx.ch.query({
      query: `SELECT DISTINCT person_id
              FROM events FINAL
              WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ person_id: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('cold-start PG fallback — returns PG-stored person_id', async () => {
    const projectId = testProject.projectId;
    const distinctId = `cold-start-${randomUUID()}`;
    const batchId1 = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: distinctId,
      event_name: 'first_event',
      batch_id: batchId1,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId1);

    const pgPersonId = await waitForDistinctIdMapping(ctx.db, projectId, distinctId, {
      timeoutMs: 5_000,
    });

    // Clear Redis cache key to simulate cold start
    await ctx.redis.del(`person:${projectId}:${distinctId}`);

    const batchId2 = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: distinctId,
      event_name: 'second_event',
      batch_id: batchId2,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId2);

    const result = await ctx.ch.query({
      query: `SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId2 },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ person_id: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(pgPersonId);
  });

  it('$identify — anon events after identify use user person_id', async () => {
    const projectId = testProject.projectId;
    const anonId = `anon-ident-${randomUUID()}`;
    const userId = `user-ident-${randomUUID()}`;
    const batchId1 = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: anonId,
      event_name: 'anon_page_view',
      anonymous_id: anonId,
      batch_id: batchId1,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId1);

    const batchId2 = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: anonId,
      event_type: 'identify',
      batch_id: batchId2,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId2);

    const result1 = await ctx.ch.query({
      query: `SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId2 },
      format: 'JSONEachRow',
    });
    const userRows = await result1.json<{ person_id: string }>();
    const userPersonId = userRows[0].person_id;

    const batchId3 = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: anonId,
      event_name: 'post_identify_event',
      batch_id: batchId3,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId3);

    const result2 = await ctx.ch.query({
      query: `SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId3 },
      format: 'JSONEachRow',
    });
    const postRows = await result2.json<{ person_id: string }>();
    expect(postRows).toHaveLength(1);
    expect(postRows[0].person_id).toBe(userPersonId);
  });

  it('$identify — override written to CH', async () => {
    const projectId = testProject.projectId;
    const anonId = `anon-ovr-${randomUUID()}`;
    const userId = `user-ovr-${randomUUID()}`;
    const batchId1 = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: anonId,
      event_name: 'anon_event',
      anonymous_id: anonId,
      batch_id: batchId1,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId1);

    const batchId2 = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: anonId,
      event_type: 'identify',
      batch_id: batchId2,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId2);

    // Wait briefly for override write to complete
    await new Promise((r) => setTimeout(r, 500));

    const overrides = await getOverrides(ctx.ch, projectId, anonId);
    expect(overrides.length).toBeGreaterThanOrEqual(1);

    const result = await ctx.ch.query({
      query: `SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId2 },
      format: 'JSONEachRow',
    });
    const userRows = await result.json<{ person_id: string }>();
    expect(overrides[0].person_id).toBe(userRows[0].person_id);
  });

  it('re-identify same pair — idempotent', async () => {
    const projectId = testProject.projectId;
    const anonId = `anon-idem-${randomUUID()}`;
    const userId = `user-idem-${randomUUID()}`;
    const batchId1 = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: anonId,
      event_name: 'anon_event',
      anonymous_id: anonId,
      batch_id: batchId1,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId1);

    const batchId2 = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: anonId,
      event_type: 'identify',
      batch_id: batchId2,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId2);

    const result1 = await ctx.ch.query({
      query: `SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId2 },
      format: 'JSONEachRow',
    });
    const rows1 = await result1.json<{ person_id: string }>();
    const personIdAfterFirst = rows1[0].person_id;

    const batchId3 = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: anonId,
      event_type: 'identify',
      batch_id: batchId3,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId3);

    const result2 = await ctx.ch.query({
      query: `SELECT DISTINCT person_id FROM events FINAL WHERE project_id = {p:UUID} AND distinct_id = {d:String}`,
      query_params: { p: projectId, d: userId },
      format: 'JSONEachRow',
    });
    const rows = await result2.json<{ person_id: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBe(personIdAfterFirst);
  });

  it('$identify with unknown anonymous_id — no merge, no errors', async () => {
    const projectId = testProject.projectId;
    const userId = `user-unknown-anon-${randomUUID()}`;
    const unknownAnonId = `never-seen-anon-${randomUUID()}`;
    const batchId = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: unknownAnonId,
      event_type: 'identify',
      batch_id: batchId,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId);

    const result = await ctx.ch.query({
      query: `SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ person_id: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBeTruthy();
  });
});
