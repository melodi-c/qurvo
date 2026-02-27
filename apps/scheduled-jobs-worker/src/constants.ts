// ── Heartbeat ─────────────────────────────────────────────────────────────
export const HEARTBEAT_PATH = '/tmp/scheduled-jobs-worker.heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_LOOP_STALE_MS = 30_000;

// ── Scheduled jobs check (periodic AI job runner) ────────────────────────────
export const SCHEDULED_JOBS_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const SCHEDULED_JOBS_INITIAL_DELAY_MS = 60_000; // 60s
