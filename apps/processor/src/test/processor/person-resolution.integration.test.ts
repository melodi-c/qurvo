import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
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
  pollUntil,
} from '../helpers';
import { PersonBatchStore } from '../../processor/person-batch-store';
import { FAILED_MERGES_KEY } from '../../constants';

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

afterEach(() => {
  vi.restoreAllMocks();
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
              FROM events
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
      query: `SELECT person_id FROM events WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
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
      query: `SELECT person_id FROM events WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
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
      query: `SELECT person_id FROM events WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
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

    // Poll until override write is visible in ClickHouse
    const overrides = await pollUntil(
      () => getOverrides(ctx.ch, projectId, anonId),
      (rows) => rows.length >= 1,
      'override written to CH',
      { timeoutMs: 5_000, intervalMs: 100 },
    );
    expect(overrides.length).toBeGreaterThanOrEqual(1);

    const result = await ctx.ch.query({
      query: `SELECT person_id FROM events WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
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
      query: `SELECT person_id FROM events WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
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
      query: `SELECT DISTINCT person_id FROM events WHERE project_id = {p:UUID} AND distinct_id = {d:String}`,
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
      query: `SELECT person_id FROM events WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ person_id: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBeTruthy();
  });
});

describe('PersonBatchStore: failed merge persistence and replay', () => {
  it('failed mergePersons is persisted to Redis and replayed on next flush', async () => {
    const personBatchStore = processorApp.get(PersonBatchStore);

    const fromPersonId = randomUUID();
    const intoPersonId = randomUUID();

    // Clean up any leftover entries from previous tests
    await ctx.redis.del(FAILED_MERGES_KEY);

    // Force mergePersons to fail by spying on the private method.
    // Cast to any to access private member for test purposes.
    const spy = vi.spyOn(personBatchStore as any, 'mergePersons').mockRejectedValue(
      new Error('simulated PG transaction failure'),
    );

    // Enqueue persons so _doFlush has something to write
    personBatchStore.enqueue(testProject.projectId, fromPersonId, `fm-from-${randomUUID()}`, '{}');
    personBatchStore.enqueue(testProject.projectId, intoPersonId, `fm-into-${randomUUID()}`, '{}');
    // Enqueue the merge — will fail during flush
    personBatchStore.enqueueMerge(testProject.projectId, fromPersonId, intoPersonId);

    // First flush: persons/distinct_ids succeed, merge fails → persisted to Redis
    await personBatchStore.flush();

    // The failed merge must now be in the Redis list
    const listLen = await ctx.redis.llen(FAILED_MERGES_KEY);
    expect(listLen).toBeGreaterThanOrEqual(1);

    const rawEntries = await ctx.redis.lrange(FAILED_MERGES_KEY, 0, -1);
    const parsedEntry = JSON.parse(rawEntries[0]) as {
      projectId: string;
      fromPersonId: string;
      intoPersonId: string;
    };
    expect(parsedEntry.fromPersonId).toBe(fromPersonId);
    expect(parsedEntry.intoPersonId).toBe(intoPersonId);

    // Restore the real mergePersons so the second flush can succeed
    spy.mockRestore();

    // Second flush (no new pending items) — triggers replayFailedMerges()
    await personBatchStore.flush();

    // The Redis list must now be empty (entry was successfully replayed and removed)
    const listLenAfter = await ctx.redis.llen(FAILED_MERGES_KEY);
    expect(listLenAfter).toBe(0);
  });
});
