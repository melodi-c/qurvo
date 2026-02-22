// NOTE: must match apps/processor/src/constants.ts
export const REDIS_STREAM_EVENTS = 'events:incoming';
export const REDIS_STREAM_MAXLEN = 1_000_000;

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_CACHE_TTL_SECONDS = 60;

export const BILLING_EVENTS_KEY_PREFIX = 'billing:events';
export const BILLING_EVENTS_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days
