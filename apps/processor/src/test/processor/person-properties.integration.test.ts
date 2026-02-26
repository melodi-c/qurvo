import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ContainerContext, TestProject } from '@qurvo/testing';
import { getTestContext } from '../context';
import {
  writeEventToStream,
  waitForEventByBatchId,
  waitForPersonInPg,
  waitForPersonProperties,
  waitForDistinctIdMapping,
  waitForPersonDeleted,
  getDistinctIdMapping,
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

/** Send event and wait for it in CH, return person_id */
async function sendEventAndGetPersonId(
  projectId: string,
  distinctId: string,
  eventName: string,
  userProperties: Record<string, unknown> = {},
): Promise<string> {
  const batchId = randomUUID();
  await writeEventToStream(ctx.redis, projectId, {
    distinct_id: distinctId,
    event_name: eventName,
    user_properties: JSON.stringify(userProperties),
    batch_id: batchId,
  });
  await waitForEventByBatchId(ctx.ch, projectId, batchId);

  const result = await ctx.ch.query({
    query: `SELECT person_id FROM events WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
    query_params: { p: projectId, b: batchId },
    format: 'JSONEachRow',
  });
  const rows = await result.json<{ person_id: string }>();
  return rows[0].person_id;
}

describe('person properties', () => {
  it('$set overwrites existing property', async () => {
    const projectId = testProject.projectId;
    const distinctId = `set-overwrite-${randomUUID()}`;

    const personId = await sendEventAndGetPersonId(projectId, distinctId, 'evt1', {
      name: 'Alice',
    });

    await waitForPersonInPg(ctx.db, personId, { timeoutMs: 5_000 });
    await waitForPersonProperties(ctx.db, personId, (p) => p.name === 'Alice');

    await sendEventAndGetPersonId(projectId, distinctId, 'evt2', {
      $set: { name: 'Bob' },
    });

    const props = await waitForPersonProperties(ctx.db, personId, (p) => p.name === 'Bob');
    expect(props.name).toBe('Bob');
  });

  it('$set_once does not overwrite existing property', async () => {
    const projectId = testProject.projectId;
    const distinctId = `set-once-${randomUUID()}`;

    const personId = await sendEventAndGetPersonId(projectId, distinctId, 'evt1', {
      name: 'Alice',
    });

    await waitForPersonInPg(ctx.db, personId, { timeoutMs: 5_000 });
    await waitForPersonProperties(ctx.db, personId, (p) => p.name === 'Alice');

    await sendEventAndGetPersonId(projectId, distinctId, 'evt2', {
      $set_once: { name: 'Bob', plan: 'pro' },
    });

    const props = await waitForPersonProperties(ctx.db, personId, (p) => p.plan === 'pro');
    expect(props.name).toBe('Alice');
    expect(props.plan).toBe('pro');
  });

  it('$unset removes key', async () => {
    const projectId = testProject.projectId;
    const distinctId = `unset-${randomUUID()}`;

    const personId = await sendEventAndGetPersonId(projectId, distinctId, 'evt1', {
      plan: 'free',
    });

    await waitForPersonInPg(ctx.db, personId, { timeoutMs: 5_000 });
    await waitForPersonProperties(ctx.db, personId, (p) => p.plan === 'free');

    await sendEventAndGetPersonId(projectId, distinctId, 'evt2', {
      $unset: ['plan'],
    });

    const props = await waitForPersonProperties(ctx.db, personId, (p) => !('plan' in p), {
      timeoutMs: 5_000,
    });
    expect(props).not.toHaveProperty('plan');
  });

  it('implicit root keys act as $set', async () => {
    const projectId = testProject.projectId;
    const distinctId = `implicit-set-${randomUUID()}`;

    const personId = await sendEventAndGetPersonId(projectId, distinctId, 'evt1', {
      country: 'US',
    });

    await waitForPersonInPg(ctx.db, personId, { timeoutMs: 5_000 });
    const props = await waitForPersonProperties(ctx.db, personId, (p) => p.country === 'US');
    expect(props.country).toBe('US');
  });

  it('mergePersons — properties merge (user wins on conflict)', async () => {
    const projectId = testProject.projectId;
    const anonId = `anon-merge-props-${randomUUID()}`;
    const userId = `user-merge-props-${randomUUID()}`;

    const anonPersonId = await sendEventAndGetPersonId(projectId, anonId, 'anon_evt', {
      theme: 'dark',
      source: 'organic',
    });

    await waitForPersonInPg(ctx.db, anonPersonId, { timeoutMs: 5_000 });
    await waitForPersonProperties(ctx.db, anonPersonId, (p) => p.theme === 'dark');

    const userPersonId = await sendEventAndGetPersonId(projectId, userId, 'user_evt', {
      source: 'paid',
      tier: 'premium',
    });

    await waitForPersonInPg(ctx.db, userPersonId, { timeoutMs: 5_000 });
    await waitForPersonProperties(ctx.db, userPersonId, (p) => p.source === 'paid');

    const batchId = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: anonId,
      event_type: 'identify',
      batch_id: batchId,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId);
    await waitForPersonDeleted(ctx.db, anonPersonId, { timeoutMs: 15_000 });

    const props = await waitForPersonProperties(
      ctx.db,
      userPersonId,
      (p) => p.theme === 'dark' && p.source === 'paid' && p.tier === 'premium',
      { timeoutMs: 5_000 },
    );
    expect(props.theme).toBe('dark');
    expect(props.source).toBe('paid');
    expect(props.tier).toBe('premium');
  });

  it('mergePersons — distinct_ids re-pointed', async () => {
    const projectId = testProject.projectId;
    const anonId = `anon-repoint-${randomUUID()}`;
    const userId = `user-repoint-${randomUUID()}`;

    await sendEventAndGetPersonId(projectId, anonId, 'anon_evt', {});
    const anonPersonId = await waitForDistinctIdMapping(ctx.db, projectId, anonId, {
      timeoutMs: 5_000,
    });

    const userPersonId = await sendEventAndGetPersonId(projectId, userId, 'user_evt', {});
    await waitForDistinctIdMapping(ctx.db, projectId, userId, { timeoutMs: 5_000 });

    const batchId = randomUUID();
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: anonId,
      event_type: 'identify',
      batch_id: batchId,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId);
    await waitForPersonDeleted(ctx.db, anonPersonId, { timeoutMs: 15_000 });

    const remappedPersonId = await getDistinctIdMapping(ctx.db, projectId, anonId);
    expect(remappedPersonId).toBe(userPersonId);
  });

  it('batch upsert handles multiple persons in a single flush', async () => {
    const projectId = testProject.projectId;
    const userCount = 5;
    const batchId = randomUUID();
    const users = Array.from({ length: userCount }, (_, i) => ({
      distinctId: `batch-user-${i}-${randomUUID()}`,
      name: `User${i}`,
    }));

    // Send all events rapidly so they land in the same flush batch
    for (const user of users) {
      await writeEventToStream(ctx.redis, projectId, {
        distinct_id: user.distinctId,
        event_name: 'batch_test_event',
        user_properties: JSON.stringify({ name: user.name }),
        batch_id: batchId,
      });
    }

    await waitForEventByBatchId(ctx.ch, projectId, batchId, { minCount: userCount });

    // Verify all persons exist in PG with correct properties
    const result = await ctx.ch.query({
      query: `SELECT person_id, properties FROM events WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ person_id: string; properties: string }>();
    expect(rows).toHaveLength(userCount);

    const personIds = new Set(rows.map((r) => r.person_id));
    expect(personIds.size).toBe(userCount);

    for (const personId of personIds) {
      await waitForPersonInPg(ctx.db, personId, { timeoutMs: 10_000 });
      const props = await waitForPersonProperties(
        ctx.db,
        personId,
        (p) => typeof p.name === 'string',
        { timeoutMs: 5_000 },
      );
      expect(props.name).toMatch(/^User\d$/);
    }
  });

  it('invalid JSON in user_properties — person created with {}', async () => {
    const projectId = testProject.projectId;
    const distinctId = `invalid-json-${randomUUID()}`;
    const batchId = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: distinctId,
      event_name: 'bad_props_event',
      user_properties: '{not valid json!!!}',
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

    const personId = rows[0].person_id;
    await waitForPersonInPg(ctx.db, personId, { timeoutMs: 5_000 });
    const props = await waitForPersonProperties(ctx.db, personId, () => true);
    expect(Object.keys(props).length).toBe(0);
  });
});
