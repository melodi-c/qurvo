import {
  COHORT_ERROR_BACKOFF_BASE_MINUTES,
  COHORT_ERROR_BACKOFF_MAX_EXPONENT,
} from '../constants';

export interface BackoffCohort {
  errors_calculating: number;
  last_error_at: Date | null;
}

/**
 * Filters out cohorts still within their error-backoff window.
 *
 * Backoff formula: 2^min(errors, MAX_EXPONENT) * BASE_MINUTES.
 * A cohort is eligible when `now >= last_error_at + backoff`.
 *
 * Cohorts with errors_calculating=0 or last_error_at=null are always eligible.
 */
export function filterByBackoff<T extends BackoffCohort>(
  staleCohorts: T[],
  now: number = Date.now(),
): T[] {
  return staleCohorts.filter((c) => {
    if (c.errors_calculating === 0 || !c.last_error_at) {return true;}
    const exponent = Math.min(c.errors_calculating, COHORT_ERROR_BACKOFF_MAX_EXPONENT);
    const backoffMs = Math.pow(2, exponent) * COHORT_ERROR_BACKOFF_BASE_MINUTES * 60_000;
    return now >= c.last_error_at.getTime() + backoffMs;
  });
}
