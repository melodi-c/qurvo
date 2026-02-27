// ── Cohort ───────────────────────────────────────────────────────────────
export const COHORT_MEMBERSHIP_INTERVAL_MS = 10 * 60_000; // 10 minutes

// ── Heartbeat ─────────────────────────────────────────────────────────────
export const HEARTBEAT_PATH = '/tmp/cohort-worker.heartbeat';
export const HEARTBEAT_INTERVAL_MS = 15_000;
// Cycle runs every 10min; allow up to 20min before considering the loop stale
export const HEARTBEAT_LOOP_STALE_MS = 2 * COHORT_MEMBERSHIP_INTERVAL_MS; // 1_200_000
// Must be > INTERVAL (to tolerate slow cycles), but < 2×INTERVAL (to avoid skipping).
export const COHORT_STALE_THRESHOLD_MINUTES = 15;
export const COHORT_ERROR_BACKOFF_BASE_MINUTES = 30;
export const COHORT_ERROR_BACKOFF_MAX_EXPONENT = 10; // cap: ~21 days
export const COHORT_MAX_ERRORS = 20; // stop retrying permanently broken cohorts
export const COHORT_GC_EVERY_N_CYCLES = 6; // ~1 hour at 10min interval

// ── Lock & scheduling ────────────────────────────────────────────────────
export const COHORT_LOCK_KEY = 'cohort_membership:lock';
export const COHORT_GC_CYCLE_REDIS_KEY = 'cohort_membership:gc_cycle_count';
export const COHORT_LOCK_TTL_SECONDS = 660;
export const COHORT_INITIAL_DELAY_MS = 30_000;

// ── Bull queue ───────────────────────────────────────────────────────────
export const COHORT_COMPUTE_QUEUE = 'cohort-compute';
export const COHORT_COMPUTE_CONCURRENCY = 4;
// Maximum time to wait for a single Bull job to complete.
// Prevents indefinite hang when Redis is unavailable or Bull worker is stuck.
// Set equal to the distributed lock TTL so the cycle cannot outlive the lock.
export const COHORT_JOB_TIMEOUT_MS = COHORT_LOCK_TTL_SECONDS * 1000; // 660_000
