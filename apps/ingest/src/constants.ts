// DI tokens
export const REDIS = Symbol('REDIS');
export const DRIZZLE = Symbol('DRIZZLE');

// Intentionally duplicated in apps/processor/src/constants.ts — both apps share
// the same Redis stream contract but have no shared runtime dependency.
export const REDIS_STREAM_EVENTS = 'events:incoming';
export const REDIS_STREAM_MAXLEN = 1_000_000;

// Stream payload schema version — bump when payload shape changes.
// The processor can use this to handle backward-compatible migrations
// for in-flight events during rolling deploys.
export const STREAM_SCHEMA_VERSION = '1';

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_CACHE_TTL_SECONDS = 300;

export const BILLING_EVENTS_KEY_PREFIX = 'billing:events';

// Billing quota: Redis Set populated by billing-check worker in @qurvo/cohort-worker.
// Intentionally duplicated in apps/cohort-worker/src/constants.ts — both apps share
// the same Redis key but have no shared runtime dependency.
export const BILLING_QUOTA_LIMITED_KEY = 'billing:quota_limited';

// Gzip bomb protection: max allowed size after decompression (matches Fastify bodyLimit)
export const MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024; // 5 MB

// Body read timeout: abort stalled uploads where clients stop sending data mid-stream
export const BODY_READ_TIMEOUT_MS = 30_000; // 30s

// Per-project rate limiting (sliding window via Redis buckets)
export const RATE_LIMIT_KEY_PREFIX = 'ratelimit';
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_EVENTS = 100_000; // 100K events per 60s per project
export const RATE_LIMIT_BUCKET_SECONDS = 10;

export function rateLimitBucketKey(projectId: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const bucket = Math.floor(nowSec / RATE_LIMIT_BUCKET_SECONDS) * RATE_LIMIT_BUCKET_SECONDS;
  return `${RATE_LIMIT_KEY_PREFIX}:${projectId}:${bucket}`;
}

/** All bucket keys covering the sliding window — used by the rate limit guard to sum counters. */
export function rateLimitWindowKeys(projectId: string, nowSec = Math.floor(Date.now() / 1000)): string[] {
  const bucketCount = RATE_LIMIT_WINDOW_SECONDS / RATE_LIMIT_BUCKET_SECONDS;
  const keys: string[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const bucket = Math.floor((nowSec - i * RATE_LIMIT_BUCKET_SECONDS) / RATE_LIMIT_BUCKET_SECONDS) * RATE_LIMIT_BUCKET_SECONDS;
    keys.push(`${RATE_LIMIT_KEY_PREFIX}:${projectId}:${bucket}`);
  }
  return keys;
}

// Max timestamp drift cap: events queued longer than this on the client
// are timestamped at server time to prevent ClickHouse TTL bypass.
export const MAX_TIMESTAMP_DRIFT_MS = 48 * 60 * 60 * 1000; // 48 hours

// Backpressure threshold: reject writes when stream reaches 90% of MAXLEN
// to prevent silent data loss from approximate trimming.
export const STREAM_BACKPRESSURE_THRESHOLD = 900_000;

// How long to cache XLEN result for backpressure checks (avoids Redis RTT per request)
export const BACKPRESSURE_CACHE_TTL_MS = 3_000;

// Handler timeout: max time for the entire handler after body parsing (protects against Redis hangs)
export const HANDLER_TIMEOUT_MS = 30_000;

// API key format limits (validated before any IO to reject garbage early)
export const API_KEY_MAX_LENGTH = 128;

export function billingCounterKey(projectId: string, now = new Date()): string {
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${BILLING_EVENTS_KEY_PREFIX}:${projectId}:${monthKey}`;
}

/** Unix timestamp (seconds) for end-of-month + 5-day safety margin. Idempotent — calling EXPIREAT multiple times sets the same absolute timestamp. */
export function billingCounterExpireAt(now = new Date()): number {
  const expiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 6));
  return Math.floor(expiry.getTime() / 1000);
}
