// Intentionally duplicated in apps/processor/src/constants.ts — both apps share
// the same Redis stream contract but have no shared runtime dependency.
export const REDIS_STREAM_EVENTS = 'events:incoming';
export const REDIS_STREAM_MAXLEN = 1_000_000;

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_CACHE_TTL_SECONDS = 60;

export const BILLING_EVENTS_KEY_PREFIX = 'billing:events';
export const BILLING_EVENTS_TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days

export function billingCounterKey(projectId: string, now = new Date()): string {
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${BILLING_EVENTS_KEY_PREFIX}:${projectId}:${monthKey}`;
}
