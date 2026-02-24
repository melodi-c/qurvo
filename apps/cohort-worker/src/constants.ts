// ── Cohort ───────────────────────────────────────────────────────────────
export const COHORT_MEMBERSHIP_INTERVAL_MS = 10 * 60_000; // 10 minutes
export const COHORT_STALE_THRESHOLD_MINUTES = 15;
export const COHORT_ERROR_BACKOFF_BASE_MINUTES = 30;
export const COHORT_ERROR_BACKOFF_MAX_EXPONENT = 10; // cap: ~21 days
export const COHORT_GC_EVERY_N_CYCLES = 6; // ~1 hour at 10min interval

// ── Lock & scheduling ────────────────────────────────────────────────────
export const COHORT_LOCK_KEY = 'cohort_membership:lock';
export const COHORT_LOCK_TTL_SECONDS = 300;
export const COHORT_INITIAL_DELAY_MS = 30_000;
