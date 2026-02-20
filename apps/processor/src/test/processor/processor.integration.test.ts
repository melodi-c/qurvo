import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  teardownContainers,
  createTestProject,
  waitForClickHouseCount,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import { AppModule } from '../../app.module';
import { REDIS_STREAM_EVENTS, writeEventToStream, getEventCount } from '../helpers';

const REDIS_CONSUMER_GROUP = 'processor-group';

let ctx: ContainerContext;
let processorApp: INestApplicationContext;
let testProject: TestProject;

beforeAll(async () => {
  ctx = await setupContainers();

  process.env.DATABASE_URL = ctx.pgUrl;
  process.env.REDIS_URL = ctx.redisUrl;
  process.env.CLICKHOUSE_URL = ctx.clickhouseUrl;
  process.env.CLICKHOUSE_DB = ctx.clickhouseDb;
  process.env.CLICKHOUSE_USER = ctx.clickhouseUser;
  process.env.CLICKHOUSE_PASSWORD = ctx.clickhousePassword;

  testProject = await createTestProject(ctx.db);

  // Ensure consumer group exists
  try {
    await ctx.redis.xgroup('CREATE', REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, '0', 'MKSTREAM');
  } catch (err: any) {
    if (!err.message?.includes('BUSYGROUP')) throw err;
  }

  // Boot the real processor — starts XREADGROUP loop and flush timer
  processorApp = await NestFactory.createApplicationContext(AppModule, { logger: false });
}, 120_000);

afterAll(async () => {
  // Graceful shutdown: flushes buffer, stops timers, closes connections
  await processorApp?.close();
  await teardownContainers();
});

describe('event processing: Redis stream → ClickHouse', () => {
  it('processes a single event and writes it to ClickHouse', async () => {
    const projectId = testProject.projectId;
    const distinctId = `proc-user-${randomUUID()}`;
    const countBefore = await getEventCount(ctx.ch, projectId);

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: distinctId,
      event_name: 'checkout',
    });

    await waitForClickHouseCount(ctx.ch, projectId, countBefore + 1, {
      timeoutMs: 20_000,
      intervalMs: 500,
    });

    const result = await ctx.ch.query({
      query: 'SELECT event_name, distinct_id FROM events FINAL WHERE project_id = {p:UUID} AND distinct_id = {d:String}',
      query_params: { p: projectId, d: distinctId },
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
    const countBefore = await getEventCount(ctx.ch, projectId);
    const batchId = randomUUID();

    for (let i = 0; i < batchSize; i++) {
      await writeEventToStream(ctx.redis, projectId, {
        distinct_id: `batch-proc-${i}-${batchId}`,
        event_name: 'batch_test_event',
        batch_id: batchId,
      });
    }

    await waitForClickHouseCount(ctx.ch, projectId, countBefore + batchSize, {
      timeoutMs: 25_000,
      intervalMs: 500,
    });

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
    const countBefore = await getEventCount(ctx.ch, projectId);

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: distinctId,
      event_name: 'page_view',
    });

    await waitForClickHouseCount(ctx.ch, projectId, countBefore + 1, {
      timeoutMs: 20_000,
      intervalMs: 500,
    });

    const result = await ctx.ch.query({
      query: 'SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND distinct_id = {d:String}',
      query_params: { p: projectId, d: distinctId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ person_id: string }>();
    expect(rows).toHaveLength(1);
    expect(rows[0].person_id).toBeTruthy();
    // person_id should be a valid UUID
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
    const countBefore = await getEventCount(ctx.ch, projectId);

    // Anonymous event first
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: anonId,
      event_name: 'page_view',
      anonymous_id: anonId,
    });

    // Then identify
    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: userId,
      event_name: '$identify',
      anonymous_id: anonId,
      event_type: 'identify',
    });

    await waitForClickHouseCount(ctx.ch, projectId, countBefore + 2, {
      timeoutMs: 25_000,
      intervalMs: 500,
    });

    // Verify both events exist
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
