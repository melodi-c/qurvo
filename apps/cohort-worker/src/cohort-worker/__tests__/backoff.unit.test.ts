import { describe, it, expect } from 'vitest';
import { filterByBackoff, type BackoffCohort } from '../backoff';
import {
  COHORT_ERROR_BACKOFF_BASE_MINUTES,
  COHORT_ERROR_BACKOFF_MAX_EXPONENT,
} from '../../constants';

function makeCohort(
  errors: number,
  lastErrorAt: Date | null,
  id = 'test',
): BackoffCohort & { id: string } {
  return { id, errors_calculating: errors, last_error_at: lastErrorAt };
}

describe('filterByBackoff', () => {
  const now = Date.now();

  it('includes cohort with errors_calculating=0 and last_error_at=null', () => {
    const cohort = makeCohort(0, null);
    const result = filterByBackoff([cohort], now);
    expect(result).toHaveLength(1);
  });

  it('includes cohort with errors_calculating=0 and last_error_at set', () => {
    const cohort = makeCohort(0, new Date(now));
    const result = filterByBackoff([cohort], now);
    expect(result).toHaveLength(1);
  });

  it('includes cohort with errors_calculating>0 but last_error_at=null', () => {
    const cohort = makeCohort(3, null);
    const result = filterByBackoff([cohort], now);
    expect(result).toHaveLength(1);
  });

  it('excludes cohort within backoff window (errors=1, last_error_at=now)', () => {
    // backoff = 2^1 * 30min = 60min
    const cohort = makeCohort(1, new Date(now));
    const result = filterByBackoff([cohort], now);
    expect(result).toHaveLength(0);
  });

  it('includes cohort after backoff expired (errors=1, last_error_at=2 hours ago)', () => {
    // backoff = 2^1 * 30min = 60min. 2 hours ago > 60min.
    const twoHoursAgo = new Date(now - 2 * 60 * 60_000);
    const cohort = makeCohort(1, twoHoursAgo);
    const result = filterByBackoff([cohort], now);
    expect(result).toHaveLength(1);
  });

  it('excludes cohort at exact backoff boundary (errors=1, last_error_at exactly 60min ago)', () => {
    // backoff = 2^1 * 30min = 60min. Exactly 60min ago means now == last_error_at + backoff.
    // The condition is now >= last_error_at + backoff, so this is eligible.
    const exactlyAtBoundary = new Date(now - 60 * 60_000);
    const cohort = makeCohort(1, exactlyAtBoundary);
    const result = filterByBackoff([cohort], now);
    expect(result).toHaveLength(1);
  });

  it('excludes cohort 1ms before backoff expires', () => {
    // backoff = 2^1 * 30min = 60min = 3_600_000ms
    const justBeforeExpiry = new Date(now - 60 * 60_000 + 1);
    const cohort = makeCohort(1, justBeforeExpiry);
    const result = filterByBackoff([cohort], now);
    expect(result).toHaveLength(0);
  });

  it('caps exponent at COHORT_ERROR_BACKOFF_MAX_EXPONENT', () => {
    // errors=100 → exponent should be capped to MAX_EXPONENT (10)
    // backoff = 2^10 * 30min = 1024 * 30min = 30720min ≈ 21.3 days
    const cappedBackoffMs = Math.pow(2, COHORT_ERROR_BACKOFF_MAX_EXPONENT)
      * COHORT_ERROR_BACKOFF_BASE_MINUTES
      * 60_000;

    // Error at exactly capped backoff ago → eligible
    const atCap = new Date(now - cappedBackoffMs);
    const cohortEligible = makeCohort(100, atCap, 'eligible');
    expect(filterByBackoff([cohortEligible], now)).toHaveLength(1);

    // Error slightly after capped backoff (1ms less elapsed) → still in backoff
    const justBefore = new Date(now - cappedBackoffMs + 1);
    const cohortInBackoff = makeCohort(100, justBefore, 'inBackoff');
    expect(filterByBackoff([cohortInBackoff], now)).toHaveLength(0);

    // Verify 100 errors and MAX_EXPONENT+1 errors produce the same backoff
    const cohortMax = makeCohort(COHORT_ERROR_BACKOFF_MAX_EXPONENT, atCap, 'max');
    const cohortOver = makeCohort(COHORT_ERROR_BACKOFF_MAX_EXPONENT + 5, atCap, 'over');
    expect(filterByBackoff([cohortMax], now)).toHaveLength(1);
    expect(filterByBackoff([cohortOver], now)).toHaveLength(1);
  });

  it('higher error counts produce longer backoff windows', () => {
    // errors=1: backoff = 2^1 * 30min = 60min
    // errors=3: backoff = 2^3 * 30min = 240min = 4 hours
    const threeHoursAgo = new Date(now - 3 * 60 * 60_000);

    const cohort1 = makeCohort(1, threeHoursAgo, 'err1');
    const cohort3 = makeCohort(3, threeHoursAgo, 'err3');

    const result = filterByBackoff([cohort1, cohort3], now);
    // errors=1: 3h > 1h backoff → eligible
    // errors=3: 3h < 4h backoff → still in backoff
    expect(result.map((c) => c.id)).toEqual(['err1']);
  });

  it('filters mixed cohorts correctly', () => {
    const cohorts = [
      makeCohort(0, null, 'no-errors'),           // eligible (no errors)
      makeCohort(1, new Date(now), 'recent-err'),  // in backoff
      makeCohort(1, new Date(now - 2 * 60 * 60_000), 'old-err'), // eligible (backoff expired)
      makeCohort(5, new Date(now), 'many-errs'),   // in backoff (2^5 * 30min = 16h)
    ];

    const result = filterByBackoff(cohorts, now);
    expect(result.map((c) => c.id)).toEqual(['no-errors', 'old-err']);
  });
});
