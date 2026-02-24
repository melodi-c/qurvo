import 'reflect-metadata';
import { randomUUID, randomBytes, createHash } from 'crypto';
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
import { eq } from 'drizzle-orm';
import { apiKeys, plans, projects } from '@qurvo/db';
import { AppModule } from '../../app.module';
import { REDIS_STREAM_EVENTS, billingCounterKey } from '../../constants';
import { addGzipPreParsing } from '../../hooks/gzip-preparsing';
import { postBatch, postBatchGzip, postImport, getBaseUrl, parseRedisFields } from '../helpers';

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

describe('POST /v1/import', () => {
  it('returns 202 and pushes all events to Redis stream', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postImport(app, testProject.apiKey, {
      events: [
        { event: 'signup', distinct_id: 'import-user-1', timestamp: new Date().toISOString() },
        { event: 'purchase', distinct_id: 'import-user-2', timestamp: new Date().toISOString() },
        { event: 'login', distinct_id: 'import-user-1', timestamp: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, count: 3 });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 3);
  });

  it('preserves event_id when provided', async () => {
    const customEventId = '11111111-1111-4111-a111-111111111111';

    const res = await postImport(app, testProject.apiKey, {
      events: [
        { event: 'custom_event', distinct_id: 'import-user-3', timestamp: new Date().toISOString(), event_id: customEventId },
      ],
    });

    expect(res.status).toBe(202);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    expect(fields.event_id).toBe(customEventId);
  });

  it('does not increment billing counter', async () => {
    const counterKey = billingCounterKey(testProject.projectId);
    const counterBefore = await ctx.redis.get(counterKey);

    await postImport(app, testProject.apiKey, {
      events: [
        { event: 'imported', distinct_id: 'import-user-4', timestamp: new Date().toISOString() },
      ],
    });

    // Wait a bit for any fire-and-forget operations to complete
    await new Promise((r) => setTimeout(r, 100));

    const counterAfter = await ctx.redis.get(counterKey);
    expect(counterAfter).toBe(counterBefore);
  });

  it('returns 400 when timestamp is missing', async () => {
    const res = await postImport(app, testProject.apiKey, {
      events: [
        { event: 'no_timestamp', distinct_id: 'import-user-5' },
      ],
    });

    expect(res.status).toBe(400);
  });

  it('sets batch_id with import- prefix', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    await postImport(app, testProject.apiKey, {
      events: [
        { event: 'prefixed', distinct_id: 'import-user-6', timestamp: new Date().toISOString() },
      ],
    });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    expect(fields.batch_id).toMatch(/^import-/);
  });
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${getBaseUrl(app)}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('API key auth', () => {
  it('returns 401 for a non-existent API key', async () => {
    const res = await postBatch(app, 'fake_key_that_does_not_exist', {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired API key', async () => {
    const tp = await createTestProject(ctx.db);

    // Set expires_at in the past
    await ctx.db
      .update(apiKeys)
      .set({ expires_at: new Date('2020-01-01') } as any)
      .where(eq(apiKeys.id, tp.apiKeyId));

    // Clear Redis cache so the guard hits the DB
    const keyHash = createHash('sha256').update(tp.apiKey).digest('hex');
    await ctx.redis.del(`apikey:${keyHash}`);

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a revoked API key', async () => {
    const tp = await createTestProject(ctx.db);

    // Revoke the key
    await ctx.db
      .update(apiKeys)
      .set({ revoked_at: new Date() } as any)
      .where(eq(apiKeys.id, tp.apiKeyId));

    // Clear Redis cache
    const keyHash = createHash('sha256').update(tp.apiKey).digest('hex');
    await ctx.redis.del(`apikey:${keyHash}`);

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired key found in Redis cache', async () => {
    const tp = await createTestProject(ctx.db);

    // Seed the Redis cache directly with an expired entry
    const keyHash = createHash('sha256').update(tp.apiKey).digest('hex');
    await ctx.redis.set(
      `apikey:${keyHash}`,
      JSON.stringify({
        project_id: tp.projectId,
        key_id: tp.apiKeyId,
        expires_at: '2020-01-01T00:00:00.000Z',
        events_limit: null,
      }),
      'EX',
      60,
    );

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(401);
  });
});

describe('Billing guard', () => {
  it('returns 429 when monthly event limit is exceeded', async () => {
    // Create a plan with a low limit
    const planId = randomUUID();
    await ctx.db.insert(plans).values({
      id: planId,
      slug: `test-plan-${randomBytes(4).toString('hex')}`,
      name: 'Limited Plan',
      events_limit: 100,
      features: { cohorts: false, lifecycle: false, stickiness: false, api_export: false, ai_insights: false },
    } as any);

    // Create a project on that plan
    const tp = await createTestProject(ctx.db);
    await ctx.db
      .update(projects)
      .set({ plan_id: planId } as any)
      .where(eq(projects.id, tp.projectId));

    // Clear API key cache so guard re-fetches with plan
    const keyHash = createHash('sha256').update(tp.apiKey).digest('hex');
    await ctx.redis.del(`apikey:${keyHash}`);

    // Pre-seed the billing counter above the limit
    const counterKey = billingCounterKey(tp.projectId);
    await ctx.redis.set(counterKey, '150');

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(429);
  });

  it('allows request when under the event limit', async () => {
    const planId = randomUUID();
    await ctx.db.insert(plans).values({
      id: planId,
      slug: `test-plan-${randomBytes(4).toString('hex')}`,
      name: 'Generous Plan',
      events_limit: 10000,
      features: { cohorts: false, lifecycle: false, stickiness: false, api_export: false, ai_insights: false },
    } as any);

    const tp = await createTestProject(ctx.db);
    await ctx.db
      .update(projects)
      .set({ plan_id: planId } as any)
      .where(eq(projects.id, tp.projectId));

    // Clear API key cache
    const keyHash = createHash('sha256').update(tp.apiKey).digest('hex');
    await ctx.redis.del(`apikey:${keyHash}`);

    // Counter well under limit
    const counterKey = billingCounterKey(tp.projectId);
    await ctx.redis.set(counterKey, '50');

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(202);
  });

  it('increments billing counter after successful batch', async () => {
    const tp = await createTestProject(ctx.db);
    const counterKey = billingCounterKey(tp.projectId);

    // Ensure counter starts at 0
    await ctx.redis.del(counterKey);

    await postBatch(app, tp.apiKey, {
      events: [
        { event: 'e1', distinct_id: 'u1', timestamp: new Date().toISOString() },
        { event: 'e2', distinct_id: 'u2', timestamp: new Date().toISOString() },
        { event: 'e3', distinct_id: 'u3', timestamp: new Date().toISOString() },
      ],
    });

    // Wait for fire-and-forget billing increment
    await new Promise((r) => setTimeout(r, 100));

    const counter = await ctx.redis.get(counterKey);
    expect(parseInt(counter!, 10)).toBe(3);
  });
});
