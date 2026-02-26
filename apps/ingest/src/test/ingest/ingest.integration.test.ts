import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestProject,
  waitForRedisStreamLength,
  pollUntil,
} from '@qurvo/testing';
import { projects } from '@qurvo/db';
import { eq } from 'drizzle-orm';
import {
  REDIS_STREAM_EVENTS,
  billingCounterKey,
  BILLING_QUOTA_LIMITED_KEY,
  RATE_LIMIT_KEY_PREFIX,
  RATE_LIMIT_MAX_EVENTS,
  RATE_LIMIT_BUCKET_SECONDS,
} from '../../constants';
import { postBatch, postBatchBeacon, postBatchGzip, postBatchGzipNoHeader, postBatchWithBodyKey, postImport, getBaseUrl, parseRedisFields } from '../helpers';
import { getTestContext } from '../context';

let ctx: Awaited<ReturnType<typeof getTestContext>>['ctx'];
let app: Awaited<ReturnType<typeof getTestContext>>['app'];
let testProject: Awaited<ReturnType<typeof getTestContext>>['testProject'];

beforeAll(async () => {
  ({ ctx, app, testProject } = await getTestContext());
}, 120_000);

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

    // Give fire-and-forget operations a brief window to complete, then assert
    // the counter was NOT incremented (import endpoint must not bill events)
    await new Promise((r) => setTimeout(r, 200));
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

  it('returns 401 for a non-existent token (cache miss path)', async () => {
    // Clear any cached entry first
    const fakeToken = 'fake_token_that_does_not_exist_in_db';
    await ctx.redis.del(`project_token:${fakeToken}`);

    const res = await postBatch(app, fakeToken, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(401);
  });

  it('uses Redis cache for subsequent requests with the same token', async () => {
    const tp = await createTestProject(ctx.db);

    // First request — DB lookup, populates cache
    const res1 = await postBatch(app, tp.apiKey, {
      events: [{ event: 'e1', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res1.status).toBe(202);

    // Verify cache was populated
    const cached = await ctx.redis.get(`project_token:${tp.apiKey}`);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.project_id).toBe(tp.projectId);

    // Second request — cache hit
    const res2 = await postBatch(app, tp.apiKey, {
      events: [{ event: 'e2', distinct_id: 'u2', timestamp: new Date().toISOString() }],
    });
    expect(res2.status).toBe(202);
  });
});

describe('Billing guard', () => {
  it('returns 200 with quota_limited when project is in quota_limited set', async () => {
    const tp = await createTestProject(ctx.db);

    // Add project to the billing:quota_limited set (populated by billing-worker)
    await ctx.redis.sadd(BILLING_QUOTA_LIMITED_KEY, tp.projectId);

    const res = await postBatch(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    // Returns 200 (not 429) to prevent SDK retries — PostHog pattern
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, quota_limited: true });

    // Cleanup
    await ctx.redis.srem(BILLING_QUOTA_LIMITED_KEY, tp.projectId);
  });

  it('allows request when project is not in quota_limited set', async () => {
    const tp = await createTestProject(ctx.db);

    // Ensure project is NOT in the set
    await ctx.redis.srem(BILLING_QUOTA_LIMITED_KEY, tp.projectId);

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

    // Poll until the fire-and-forget billing counter is written to Redis
    await pollUntil(async () => {
      const val = await ctx.redis.get(counterKey);
      return val !== null;
    }, { timeout: 2000, interval: 50 });

    const counter = await ctx.redis.get(counterKey);
    expect(parseInt(counter!, 10)).toBe(3);
  });

  it('returns 204 for beacon request when project is quota limited', async () => {
    const tp = await createTestProject(ctx.db);

    // Add project to the billing:quota_limited set
    await ctx.redis.sadd(BILLING_QUOTA_LIMITED_KEY, tp.projectId);

    // Beacon requests with quota exceeded still return 204
    const res = await postBatchBeacon(app, tp.apiKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(204);

    // Cleanup
    await ctx.redis.srem(BILLING_QUOTA_LIMITED_KEY, tp.projectId);
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

  it('preserves client-provided event_id instead of generating a server one', async () => {
    const clientEventId = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);

    const res = await postBatch(app, testProject.apiKey, {
      events: [{ event: 'client_id_test', distinct_id: 'client-id-user', timestamp: new Date().toISOString(), event_id: clientEventId }],
    });

    expect(res.status).toBe(202);

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    expect(fields.event_id).toBe(clientEventId);
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

describe('User-Agent passthrough', () => {
  it('stores raw User-Agent string in stream (UA parsing deferred to processor)', async () => {
    const streamLenBefore = await ctx.redis.xlen(REDIS_STREAM_EVENTS);
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': testProject.apiKey,
        'User-Agent': userAgent,
      },
      body: JSON.stringify({
        events: [{ event: 'ua_test', distinct_id: 'ua-user', timestamp: new Date().toISOString() }],
      }),
    });

    expect(res.status).toBe(202);

    await waitForRedisStreamLength(ctx.redis, REDIS_STREAM_EVENTS, streamLenBefore + 1);

    const messages = await ctx.redis.xrevrange(REDIS_STREAM_EVENTS, '+', '-', 'COUNT', 1);
    const fields = parseRedisFields(messages[0][1]);
    expect(fields.user_agent).toBe(userAgent);
    // browser/os/device_type are empty when no SDK context — processor parses UA
    expect(fields.browser).toBe('');
    expect(fields.os).toBe('');
    expect(fields.device_type).toBe('');
  });

  it('stores SDK context fields alongside raw user_agent', async () => {
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
    // SDK context fields are stored as-is
    expect(fields.browser).toBe('CustomBrowser');
    expect(fields.os).toBe('CustomOS');
    expect(fields.device_type).toBe('mobile');
    // Raw UA is also stored for processor fallback
    expect(fields.user_agent).toContain('Chrome');
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

    const nowSec = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSec / RATE_LIMIT_BUCKET_SECONDS) * RATE_LIMIT_BUCKET_SECONDS;
    const key = `${RATE_LIMIT_KEY_PREFIX}:${tp.projectId}:${bucket}`;

    // Poll until the fire-and-forget rate-limit counter is written to Redis
    await pollUntil(async () => {
      const val = await ctx.redis.get(key);
      return val !== null;
    }, { timeout: 2000, interval: 50 });

    const counter = await ctx.redis.get(key);
    expect(parseInt(counter!, 10)).toBe(2);
  });
});

describe('Legacy SDK hash-based auth (migration 0037 backward compatibility)', () => {
  // Simulates an old SDK that sends rawKey (32-char base64url).
  // Migration 0037 stores sha256(rawKey) as projects.token, so the guard
  // must hash the incoming token and perform a second DB lookup when the
  // direct match fails.

  it('authenticates old SDK rawKey when projects.token stores sha256(rawKey)', async () => {
    // Simulate a project that was migrated: its token is sha256(rawKey)
    const rawKey = 'legacyrawkey1234567890abcdefghij'; // 32-char raw key
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const { projectId } = await createTestProject(ctx.db);
    // Override the token to be the hash (as migration 0037 would have set it)
    await ctx.db.update(projects).set({ token: keyHash }).where(eq(projects.id, projectId));

    // Old SDK sends rawKey — guard must hash it and find the project
    const res = await postBatch(app, rawKey, {
      events: [{ event: 'legacy_sdk_event', distinct_id: 'legacy-user', timestamp: new Date().toISOString() }],
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, count: 1, dropped: 0 });
  });

  it('caches hash-lookup result so subsequent legacy SDK requests hit Redis cache', async () => {
    const rawKey = 'anotherlegacykey987654321zyxwvut'; // 32-char raw key
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const { projectId } = await createTestProject(ctx.db);
    await ctx.db.update(projects).set({ token: keyHash }).where(eq(projects.id, projectId));

    // Clear any existing cache entries
    await ctx.redis.del(`project_token:${rawKey}`);
    await ctx.redis.del(`project_token:${keyHash}`);

    // First request — triggers DB hash fallback, populates hash cache
    const res1 = await postBatch(app, rawKey, {
      events: [{ event: 'cache_test_1', distinct_id: 'cache-user', timestamp: new Date().toISOString() }],
    });
    expect(res1.status).toBe(202);

    // Verify cache was populated under the hash key
    const cached = await ctx.redis.get(`project_token:${keyHash}`);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.project_id).toBe(projectId);

    // Second request — should use cache (hash cache hit)
    const res2 = await postBatch(app, rawKey, {
      events: [{ event: 'cache_test_2', distinct_id: 'cache-user', timestamp: new Date().toISOString() }],
    });
    expect(res2.status).toBe(202);
  });

  it('returns 401 for a rawKey whose sha256 does not match any project token', async () => {
    const unknownRawKey = 'unknownrawkey000000000000000000x';

    const res = await postBatch(app, unknownRawKey, {
      events: [{ event: 'test', distinct_id: 'u1', timestamp: new Date().toISOString() }],
    });

    expect(res.status).toBe(401);
  });
});
