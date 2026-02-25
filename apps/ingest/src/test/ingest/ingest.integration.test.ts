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
import {
  REDIS_STREAM_EVENTS,
  billingCounterKey,
  RATE_LIMIT_KEY_PREFIX,
  RATE_LIMIT_MAX_EVENTS,
  RATE_LIMIT_BUCKET_SECONDS,
} from '../../constants';
import { addGzipPreParsing } from '../../hooks/gzip-preparsing';
import { postBatch, postBatchBeacon, postBatchGzip, postBatchGzipNoHeader, postBatchWithBodyKey, postImport, getBaseUrl, parseRedisFields } from '../helpers';

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
    expect(res.body).toEqual({ ok: true, count: 3, dropped: 0 });

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
    expect(res.body).toEqual({ ok: true, count: 2, dropped: 0 });

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

  it('ingests valid events and drops invalid ones (per-event validation)', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postBatch(app, testProject.apiKey, {
      events: [
        { event: 'valid_event', distinct_id: 'user-1', timestamp: new Date().toISOString() },
        { distinct_id: 'user-2' }, // missing 'event' field
        { event: '', distinct_id: 'user-3' }, // empty event name
        { event: 'another_valid', distinct_id: 'user-4', timestamp: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, count: 2, dropped: 2 });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 2);
  });

  it('returns 400 when all events fail validation', async () => {
    const res = await postBatch(app, testProject.apiKey, {
      events: [
        { distinct_id: 'user-1' }, // missing 'event'
        { event: '' }, // empty event, missing distinct_id
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.dropped).toBe(2);
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
  it('accepts api_key in request body instead of header', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postBatchWithBodyKey(app, testProject.apiKey, {
      events: [{ event: 'body_key_event', distinct_id: 'body-key-user', timestamp: new Date().toISOString() }],
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, count: 1, dropped: 0 });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);
  });

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

    // Clear Redis cache so the guard hits the DB
    const keyHash = createHash('sha256').update(tp.apiKey).digest('hex');
    await ctx.redis.del(`apikey:${keyHash}`);

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a revoked key found in Redis cache', async () => {
    const tp = await createTestProject(ctx.db);

    // Seed the Redis cache directly with a revoked entry
    const keyHash = createHash('sha256').update(tp.apiKey).digest('hex');
    await ctx.redis.set(
      `apikey:${keyHash}`,
      JSON.stringify({
        project_id: tp.projectId,
        key_id: tp.apiKeyId,
        expires_at: null,
        revoked_at: new Date().toISOString(),
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
        revoked_at: null,
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
  it('returns 200 with quota_limited when monthly event limit is exceeded', async () => {
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
    // Returns 200 (not 429) to prevent SDK retries — PostHog pattern
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, quota_limited: true });
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

  it('returns 200 with quota_limited for beacon request when over limit', async () => {
    const planId = randomUUID();
    await ctx.db.insert(plans).values({
      id: planId,
      slug: `test-plan-${randomBytes(4).toString('hex')}`,
      name: 'Beacon Limited Plan',
      events_limit: 10,
      features: { cohorts: false, lifecycle: false, stickiness: false, api_export: false, ai_insights: false },
    } as any);

    const tp = await createTestProject(ctx.db);
    await ctx.db.update(projects).set({ plan_id: planId } as any).where(eq(projects.id, tp.projectId));

    const keyHash = createHash('sha256').update(tp.apiKey).digest('hex');
    await ctx.redis.del(`apikey:${keyHash}`);
    await ctx.redis.set(billingCounterKey(tp.projectId), '100');

    // Beacon requests with quota exceeded still return 204
    const res = await postBatchBeacon(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(204);
  });
});

describe('Beacon support', () => {
  it('returns 204 No Content for ?beacon=1 requests', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postBatchBeacon(app, testProject.apiKey, {
      events: [
        { event: 'pageleave', distinct_id: 'beacon-user', timestamp: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(204);
    expect(res.body).toBe('');

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);
  });
});

describe('Gzip auto-detect', () => {
  it('decompresses gzip body without Content-Encoding header', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postBatchGzipNoHeader(app, testProject.apiKey, {
      events: [
        { event: 'auto_gzip_event', distinct_id: 'auto-gzip-user', timestamp: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, count: 1, dropped: 0 });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);
  });
});

describe('Illegal distinct_id blocklist', () => {
  it('drops events with illegal distinct_id values', async () => {
    const res = await postBatch(app, testProject.apiKey, {
      events: [
        { event: 'test', distinct_id: 'null', timestamp: new Date().toISOString() },
        { event: 'test', distinct_id: 'undefined', timestamp: new Date().toISOString() },
        { event: 'test', distinct_id: '[object Object]', timestamp: new Date().toISOString() },
        { event: 'test', distinct_id: 'valid-user-123', timestamp: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, count: 1, dropped: 3 });
  });

  it('returns 400 when all events have illegal distinct_id', async () => {
    const res = await postBatch(app, testProject.apiKey, {
      events: [
        { event: 'test', distinct_id: 'anonymous', timestamp: new Date().toISOString() },
        { event: 'test', distinct_id: 'NaN', timestamp: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.dropped).toBe(2);
  });

  it('rejects import events with illegal distinct_id', async () => {
    const res = await postImport(app, testProject.apiKey, {
      events: [
        { event: 'test', distinct_id: 'guest', timestamp: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(400);
  });
});

describe('Schema version', () => {
  it('includes schema_version in stream payload', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    await postBatch(app, testProject.apiKey, {
      events: [{ event: 'version_test', distinct_id: 'version-user', timestamp: new Date().toISOString() }],
    });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    expect(fields.schema_version).toBe('1');
  });
});

describe('UUIDv7 event IDs', () => {
  it('generates UUIDv7 event_id for ingested events', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    await postBatch(app, testProject.apiKey, {
      events: [{ event: 'uuid_test', distinct_id: 'uuid-user', timestamp: new Date().toISOString() }],
    });

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    // UUIDv7: version nibble is '7', variant nibble is 8/9/a/b
    expect(fields.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('Max batch size enforcement', () => {
  it('returns 400 when batch exceeds 500 events', async () => {
    const events = Array.from({ length: 501 }, (_, i) => ({
      event: `event_${i}`,
      distinct_id: `user_${i}`,
      timestamp: new Date().toISOString(),
    }));

    const res = await postBatch(app, testProject.apiKey, { events });
    expect(res.status).toBe(400);
  });

  it('returns 400 when import batch exceeds 5000 events', async () => {
    const events = Array.from({ length: 5001 }, (_, i) => ({
      event: `event_${i}`,
      distinct_id: `user_${i}`,
      timestamp: new Date().toISOString(),
    }));

    const res = await postImport(app, testProject.apiKey, { events });
    expect(res.status).toBe(400);
  });
});

describe('UA enrichment', () => {
  it('parses User-Agent header and writes browser/os/device fields to stream', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': testProject.apiKey,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        events: [{ event: 'ua_test', distinct_id: 'ua-user', timestamp: new Date().toISOString() }],
      }),
    });

    expect(res.status).toBe(202);

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    expect(fields.browser).toBe('Chrome');
    expect(fields.os).toBe('macOS');
    expect(fields.device_type).toBe('desktop');
  });

  it('prefers SDK-reported context fields over UA-parsed values', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': testProject.apiKey,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
      },
      body: JSON.stringify({
        events: [{
          event: 'ctx_override_test',
          distinct_id: 'ctx-user',
          timestamp: new Date().toISOString(),
          context: { browser: 'CustomBrowser', os: 'CustomOS', device_type: 'mobile' },
        }],
      }),
    });

    expect(res.status).toBe(202);

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    expect(fields.browser).toBe('CustomBrowser');
    expect(fields.os).toBe('CustomOS');
    expect(fields.device_type).toBe('mobile');
  });
});

describe('Rate limiting', () => {
  function seedRateLimitBuckets(projectId: string, count: number): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSec / RATE_LIMIT_BUCKET_SECONDS) * RATE_LIMIT_BUCKET_SECONDS;
    const key = `${RATE_LIMIT_KEY_PREFIX}:${projectId}:${bucket}`;
    return ctx.redis.set(key, String(count), 'EX', 120).then(() => undefined);
  }

  it('returns 429 when rate limit exceeded', async () => {
    const tp = await createTestProject(ctx.db);
    await seedRateLimitBuckets(tp.projectId, RATE_LIMIT_MAX_EVENTS);

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });

    expect(res.status).toBe(429);
    expect(res.body.message).toBe('Rate limit exceeded');
    expect(res.body.retry_after).toBe(RATE_LIMIT_BUCKET_SECONDS);
  });

  it('allows request when under limit', async () => {
    const tp = await createTestProject(ctx.db);
    await seedRateLimitBuckets(tp.projectId, 50);

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });

    expect(res.status).toBe(202);
  });

  it('rate-limits import endpoint', async () => {
    const tp = await createTestProject(ctx.db);
    await seedRateLimitBuckets(tp.projectId, RATE_LIMIT_MAX_EVENTS * 2);

    const res = await postImport(app, tp.apiKey, {
      events: [{ event: 'imported', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });

    expect(res.status).toBe(429);
  });

  it('increments rate limit counter after successful batch', async () => {
    const tp = await createTestProject(ctx.db);

    await postBatch(app, tp.apiKey, {
      events: [
        { event: 'e1', distinct_id: 'u1', timestamp: new Date().toISOString() },
        { event: 'e2', distinct_id: 'u2', timestamp: new Date().toISOString() },
      ],
    });

    // Wait for fire-and-forget increment
    await new Promise((r) => setTimeout(r, 100));

    const nowSec = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSec / RATE_LIMIT_BUCKET_SECONDS) * RATE_LIMIT_BUCKET_SECONDS;
    const key = `${RATE_LIMIT_KEY_PREFIX}:${tp.projectId}:${bucket}`;
    const counter = await ctx.redis.get(key);
    expect(parseInt(counter!, 10)).toBe(2);
  });
});
