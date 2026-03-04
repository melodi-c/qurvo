import type { Expr, QueryNode } from '@qurvo/ch-query';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import {
  select,
  col,
  and,
  lt,
  min,
  groupUniqArray,
  arraySort,
} from '@qurvo/ch-query';
import {
  resolvedPerson,
  analyticsWhere,
  projectIs,
  eventIs,
  cohortFilter,
  cohortBounds,
  tsParam,
  toChTs,
  shiftDate,
  truncateDate,
  bucket,
  neighborBucket,
  type PropertyFilter,
} from '../query-helpers';

// ── Public types ────────────────────────────────────────────────────────────

export type LifecycleGranularity = 'day' | 'week' | 'month';

export interface LifecycleCTEParams {
  project_id: string;
  target_event: string;
  granularity: LifecycleGranularity;
  date_from: string;
  date_to: string;
  filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
  timezone: string;
}

export interface LifecycleCTEResult {
  /** person_buckets CTE query */
  personBuckets: QueryNode;
  /** prior_active CTE query */
  priorActive: QueryNode;
  /** Expression for the previous bucket relative to col('bucket') */
  prevBucketExpr: Expr;
  /** Expression for the next bucket relative to col('bucket') */
  nextBucketExpr: Expr;
  /** Parameterized timestamp for date_from */
  fromParam: Expr;
  /** Parameterized timestamp for date_to (end-of-day) */
  toParam: Expr;
  /** Subquery reference to prior_active for NOT IN checks */
  priorActiveRef: QueryNode;
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds the two lifecycle CTEs (person_buckets, prior_active) and shared
 * expressions used by both the analytics query (`lifecycle.query.ts`) and the
 * persons-at drill-down query (`persons-at-lifecycle-bucket.query.ts`).
 *
 * Two-CTE approach:
 *   person_buckets  — per-person sorted bucket array over [extended_from, to].
 *                     extended_from = date_from - 1 period gives the 'returning'
 *                     classifier one look-back period.
 *   prior_active    — users with any matching event strictly before extended_from.
 *                     Used to distinguish truly 'new' users from users who are
 *                     'resurrecting' after a long absence (> 1 period).
 */
export function buildLifecycleCTEs(params: LifecycleCTEParams): LifecycleCTEResult {
  const tz = params.timezone;
  const { dateTo: cbDateTo, dateFrom: cbDateFrom } = cohortBounds(params);
  const extendedFrom = shiftDate(
    truncateDate(params.date_from, params.granularity),
    -1,
    params.granularity,
  );

  const bucketExpr = bucket(params.granularity, 'timestamp', tz);
  const prevBucketExpr = neighborBucket(params.granularity, col('bucket'), -1, tz);
  const nextBucketExpr = neighborBucket(params.granularity, col('bucket'), 1, tz);

  // CTE: person_buckets — per-person sorted bucket array over [extended_from, to]
  const personBuckets = select(
    resolvedPerson().as('person_id'),
    arraySort(groupUniqArray(bucketExpr)).as('buckets'),
    min(bucketExpr).as('first_bucket'),
  )
    .from('events')
    .where(
      analyticsWhere({
        projectId: params.project_id,
        from: extendedFrom,
        to: params.date_to,
        tz,
        eventName: params.target_event,
        filters: params.filters,
        cohortFilters: params.cohort_filters,
        tsColumn: col('timestamp'),
        dateTo: cbDateTo, dateFrom: cbDateFrom,
      }),
    )
    .groupBy(col('person_id'))
    .build();

  // CTE: prior_active — users with any matching event strictly before extended_from.
  // NOTE: eventFilterClause is intentionally NOT applied here. A user who fired
  // the target event before the range (even without matching property filters) is
  // considered "previously active" and must be classified as 'resurrecting', not 'new'.
  const priorActive = select(
    resolvedPerson().as('person_id'),
  )
    .from('events')
    .where(and(
      projectIs(params.project_id),
      eventIs(params.target_event),
      lt(col('timestamp'), tsParam(extendedFrom, tz)),
      cohortFilter(
        params.cohort_filters,
        params.project_id,
        cbDateTo,
        cbDateFrom,
      ),
    ))
    .groupBy(col('person_id'))
    .build();

  // Shared expressions
  const fromParam = tsParam(params.date_from, tz);
  const toParam = tsParam(toChTs(params.date_to, true), tz);

  // Reference the prior_active CTE by name for the NOT IN subquery
  const priorActiveRef = select(col('person_id')).from('prior_active').build();

  return {
    personBuckets,
    priorActive,
    prevBucketExpr,
    nextBucketExpr,
    fromParam,
    toParam,
    priorActiveRef,
  };
}
