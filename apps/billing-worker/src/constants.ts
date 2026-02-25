// ── Billing check (decoupled quota — PostHog pattern) ────────────────────
export const BILLING_CHECK_INTERVAL_MS = 30_000; // 30s
export const BILLING_INITIAL_DELAY_MS = 5_000; // 5s (fast startup)
export const BILLING_SET_TTL_SECONDS = 120; // safety TTL if worker stops

// Intentionally duplicated from apps/ingest/src/constants.ts — both apps share
// the same Redis key contracts but have no shared runtime dependency.
export const BILLING_EVENTS_KEY_PREFIX = 'billing:events';
export const BILLING_QUOTA_LIMITED_KEY = 'billing:quota_limited';

export function billingCounterKey(projectId: string, now = new Date()): string {
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${BILLING_EVENTS_KEY_PREFIX}:${projectId}:${monthKey}`;
}
