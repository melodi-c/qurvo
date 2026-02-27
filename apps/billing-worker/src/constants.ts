// ── Heartbeat ─────────────────────────────────────────────────────────────
export const HEARTBEAT_PATH = '/tmp/billing-worker.heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_LOOP_STALE_MS = 30_000;

// ── Billing check (decoupled quota — PostHog pattern) ────────────────────
export const BILLING_CHECK_INTERVAL_MS = 30_000; // 30s
export const BILLING_INITIAL_DELAY_MS = 5_000; // 5s (fast startup)
export const BILLING_SET_TTL_SECONDS = 120; // safety TTL if worker stops

// Intentionally duplicated from apps/ingest/src/constants.ts — both apps share
// the same Redis key contracts but have no shared runtime dependency.
export const BILLING_EVENTS_KEY_PREFIX = 'billing:events';
export const BILLING_QUOTA_LIMITED_KEY = 'billing:quota_limited';

// ── AI quota reset (periodic stale-key cleanup) ───────────────────────────────
export const AI_QUOTA_RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const AI_QUOTA_RESET_INITIAL_DELAY_MS = 10_000; // 10s

// AI quota counter prefix (duplicated from apps/api/src/ai/guards/ai-quota.guard.ts)
// Key pattern: ai:quota:{userId}:{YYYY-MM}
export const AI_QUOTA_KEY_PREFIX = 'ai:quota';

export function billingCounterKey(projectId: string, now = new Date()): string {
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${BILLING_EVENTS_KEY_PREFIX}:${projectId}:${monthKey}`;
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function previousMonthKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
