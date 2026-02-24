import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  setupContainers,
  createTestProject,
  waitForRedisStreamLength,
  type ContainerContext,
  type TestProject,
} from '@qurvo/testing';
import { AppModule } from '../../app.module';
import { REDIS_STREAM_EVENTS } from '../../constants';
import { addGzipPreParsing } from '../../hooks/gzip-preparsing';
import { postTrack, postBatch, postTrackGzip, postBatchGzip, getBaseUrl, parseRedisFields } from '../helpers';

let ctx: ContainerContext;
let app: INestApplication;
let testProject: TestProject;

beforeAll(async () => {
  ctx = await setupContainers();

  process.env.DATABASE_URL = ctx.pgUrl;
  process.env.REDIS_URL = ctx.redisUrl;

  testProject = await createTestProject(ctx.db);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ bodyLimit: 1048576 }));

  addGzipPreParsing((app as NestFastifyApplication).getHttpAdapter().getInstance());

  await app.init();
  await app.listen(0);
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('POST /v1/track', () => {
  it('returns 202 and pushes event to Redis stream', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postTrack(app, testProject.apiKey, {
      event: 'button_click',
      distinct_id: 'test-user-1',
      properties: { button: 'signup' },
      timestamp: new Date().toISOString(),
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    // Verify the last message in stream
    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    expect(messages.length).toBeGreaterThan(0);

    const fields = parseRedisFields(messages[0][1]);
    expect(fields.event_name).toBe('button_click');
    expect(fields.distinct_id).toBe('test-user-1');
    expect(fields.project_id).toBe(testProject.projectId);
  });

  it('enriches event with server-side fields', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    await postTrack(app, testProject.apiKey, {
      event: '$pageview',
      distinct_id: 'enriched-user',
    });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);

    expect(fields.event_type).toBe('pageview');
    expect(fields.event_id).toBeTruthy();
    expect(fields.timestamp).toBeTruthy();
    expect(fields.project_id).toBe(testProject.projectId);
  });

  it('returns 401 with invalid API key', async () => {
    const res = await postTrack(app, 'invalid-key-xyz', {
      event: 'test',
      distinct_id: 'u1',
    });

    expect(res.status).toBe(401);
  });

  it('returns 400 with missing required fields', async () => {
    const res = await postTrack(app, testProject.apiKey, {
      // missing event and distinct_id
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/batch', () => {
  it('returns 202 and pushes all events to Redis stream', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postBatch(app, testProject.apiKey, {
      events: [
        { event: 'page_view', distinct_id: 'batch-user-1', timestamp: new Date().toISOString() },
        { event: 'page_view', distinct_id: 'batch-user-2', timestamp: new Date().toISOString() },
        { event: 'click', distinct_id: 'batch-user-1', timestamp: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, count: 3 });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 3);
  });

  it('returns 400 when events array is empty', async () => {
    const res = await postBatch(app, testProject.apiKey, {
      events: [],
    });

    expect(res.status).toBe(400);
  });

  it('accepts gzip-compressed batch and pushes events to Redis stream', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postBatchGzip(app, testProject.apiKey, {
      events: [
        { event: 'gzip_event_1', distinct_id: 'gzip-user-1', timestamp: new Date().toISOString() },
        { event: 'gzip_event_2', distinct_id: 'gzip-user-2', timestamp: new Date().toISOString() },
      ],
      sent_at: new Date().toISOString(),
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, count: 2 });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 2);
  });

  it('accepts gzip-compressed single track event', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postTrackGzip(app, testProject.apiKey, {
      event: 'gzip_single',
      distinct_id: 'gzip-single-user',
      timestamp: new Date().toISOString(),
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    expect(fields.event_name).toBe('gzip_single');
    expect(fields.distinct_id).toBe('gzip-single-user');
  });

  it('returns 400 for invalid gzip payload', async () => {
    const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Encoding': 'gzip',
        'x-api-key': testProject.apiKey,
      },
      body: 'not-valid-gzip-data',
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 without API key header', async () => {
    const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ event: 'test', distinct_id: 'u1' }] }),
    });

    expect(res.status).toBe(401);
  });
});
