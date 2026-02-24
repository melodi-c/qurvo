import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ContainerContext, TestProject } from '@qurvo/testing';
import { personDistinctIds, persons } from '@qurvo/db';
import { eq, and } from 'drizzle-orm';
import { AppModule } from '../../app.module';
import { getTestContext } from '../context';
import {
  writeEventToStream,
  waitForEventByBatchId,
  waitForDistinctIdMapping,
  flushBuffer,
} from '../helpers';

describe('person_id consistency PG ↔ CH', () => {
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

  it('person_id in CH matches PG persons + person_distinct_ids', async () => {
    const projectId = testProject.projectId;
    const distinctId = `consistency-${randomUUID()}`;
    const batchId = randomUUID();

    await writeEventToStream(ctx.redis, projectId, {
      distinct_id: distinctId,
      event_name: 'consistency_event',
      user_properties: JSON.stringify({ source: 'consistency_test' }),
      batch_id: batchId,
    });

    await waitForEventByBatchId(ctx.ch, projectId, batchId);

    const chResult = await ctx.ch.query({
      query: `SELECT person_id FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const chRows = await chResult.json<{ person_id: string }>();
    expect(chRows).toHaveLength(1);
    const chPersonId = chRows[0].person_id;

    const pgPersonId = await waitForDistinctIdMapping(ctx.db, projectId, distinctId, {
      timeoutMs: 5_000,
    });

    expect(pgPersonId).toBe(chPersonId);

    const personRows = await ctx.db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.id, chPersonId), eq(persons.project_id, projectId)))
      .limit(1);
    expect(personRows).toHaveLength(1);

    const mappingRows = await ctx.db
      .select({ person_id: personDistinctIds.person_id })
      .from(personDistinctIds)
      .where(
        and(
          eq(personDistinctIds.project_id, projectId),
          eq(personDistinctIds.distinct_id, distinctId),
        ),
      )
      .limit(1);
    expect(mappingRows).toHaveLength(1);
    expect(mappingRows[0].person_id).toBe(chPersonId);
  });
});

describe('graceful shutdown flushes buffer', () => {
  let ctx: ContainerContext;
  let shutdownApp: INestApplicationContext;
  let testProject: TestProject;

  beforeAll(async () => {
    // Use shared containers but boot a SEPARATE NestJS app for shutdown test
    const tc = await getTestContext();
    ctx = tc.ctx;
    testProject = tc.testProject;

    shutdownApp = await NestFactory.createApplicationContext(AppModule, { logger: false });
  }, 120_000);

  it('graceful shutdown flushes buffer — all events in CH', async () => {
    const projectId = testProject.projectId;
    const batchSize = 3;
    const batchId = randomUUID();

    for (let i = 0; i < batchSize; i++) {
      await writeEventToStream(ctx.redis, projectId, {
        distinct_id: `shutdown-${i}-${batchId}`,
        event_name: 'shutdown_test_event',
        batch_id: batchId,
      });
    }

    // Give the consumer loop a moment to read events into the buffer
    await new Promise((r) => setTimeout(r, 1000));

    // Close triggers onApplicationShutdown → flush
    await shutdownApp.close();

    const result = await ctx.ch.query({
      query: `SELECT count() AS cnt FROM events FINAL WHERE project_id = {p:UUID} AND batch_id = {b:String}`,
      query_params: { p: projectId, b: batchId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ cnt: string }>();
    expect(Number(rows[0].cnt)).toBe(batchSize);
  });
});
