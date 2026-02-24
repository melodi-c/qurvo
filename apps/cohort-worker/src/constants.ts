// ── Cohort ───────────────────────────────────────────────────────────────
export const COHORT_MEMBERSHIP_INTERVAL_MS = 10 * 60_000; // 10 minutes
export const COHORT_STALE_THRESHOLD_MINUTES = 15;
export const COHORT_ERROR_BACKOFF_BASE_MINUTES = 30;
export const COHORT_ERROR_BACKOFF_MAX_EXPONENT = 10; // cap: ~21 days
