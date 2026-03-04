import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import {
  select,
  col,
  literal,
  and,
  eq,
  gte,
  groupUniqArray,
  has,
  lt,
  lte,
  min,
  not,
  multiIf,
  notInSubquery,
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
} from '../analytics/query-helpers';

export type LifecycleGranularity = 'day' | 'week' | 'month';
export type LifecycleStatus = 'new' | 'returning' | 'resurrecting' | 'dormant';

export interface PersonsAtLifecycleBucketParams {
  project_id: string;
  target_event: string;
  granularity: LifecycleGranularity;
  date_from: string;
  date_to: string;
  /** The specific bucket datetime to filter on (ISO date string, e.g. "2026-03-01") */
  bucket: string;
  /** The lifecycle status to filter on */
  status: LifecycleStatus;
  filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
  timezone: string;
  limit: number;
  offset: number;
}

interface RawPersonAtBucketRow {
  person_id: string;
}

/**
 * Finds person IDs at a specific lifecycle bucket + status.
 *
 * Reconstructs the same two-CTE lifecycle classification from lifecycle.query.ts:
 *   person_buckets  -> per-person sorted bucket array over [extended_from, to]
 *   prior_active    -> users with any matching event strictly before extended_from
 *
 * Then filters the classified results to a specific bucket + status and returns
 * the person_ids with pagination.
 */
export async function queryPersonsAtLifecycleBucket(
  ch: ClickHouseClient,
  params: PersonsAtLifecycleBucketParams,
): Promise<{ person_ids: string[]; total: number }> {
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

  // CTE: person_buckets
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

  // CTE: prior_active
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

  const fromParam = tsParam(params.date_from, tz);
  const toParam = tsParam(toChTs(params.date_to, true), tz);
  const targetBucketParam = tsParam(params.bucket, tz);

  const priorActiveRef = select(col('person_id')).from('prior_active').build();

  if (params.status === 'dormant') {
    // Dormant: users active in period N but not in period N+1
    // We need nextBucketExpr == target bucket, meaning the user was active in the
    // preceding bucket and NOT in the target bucket.
    const dormantQuery = select(
      col('person_id'),
    )
      .with('person_buckets', personBuckets)
      .with('prior_active', priorActive)
      .from('person_buckets')
      .arrayJoin(col('buckets'), 'bucket')
      .where(and(
        not(has(col('buckets'), nextBucketExpr)),
        eq(nextBucketExpr, targetBucketParam),
        gte(nextBucketExpr, fromParam),
        lte(nextBucketExpr, toParam),
      ))
      .groupBy(col('person_id'))
      .orderBy(col('person_id'))
      .limit(params.limit, params.offset)
      .build();

    const countQuery = select(
      col('person_id'),
    )
      .with('person_buckets', personBuckets)
      .with('prior_active', priorActive)
      .from('person_buckets')
      .arrayJoin(col('buckets'), 'bucket')
      .where(and(
        not(has(col('buckets'), nextBucketExpr)),
        eq(nextBucketExpr, targetBucketParam),
        gte(nextBucketExpr, fromParam),
        lte(nextBucketExpr, toParam),
      ))
      .groupBy(col('person_id'))
      .build();

    const exec = new ChQueryExecutor(ch);
    const [rows, countRows] = await Promise.all([
      exec.rows<RawPersonAtBucketRow>(dormantQuery),
      exec.rows<RawPersonAtBucketRow>(countQuery),
    ]);

    return {
      person_ids: rows.map((r) => r.person_id),
      total: countRows.length,
    };
  }

  // Active statuses (new, returning, resurrecting)
  const activeStatuses = select(
    col('person_id'),
    col('bucket').as('ts_bucket'),
    multiIf(
      [
        {
          condition: and(
            eq(col('bucket'), col('first_bucket')),
            notInSubquery(col('person_id'), priorActiveRef),
          ),
          result: literal('new'),
        },
        {
          condition: has(col('buckets'), prevBucketExpr),
          result: literal('returning'),
        },
      ],
      literal('resurrecting'),
    ).as('status'),
  )
    .from('person_buckets')
    .arrayJoin(col('buckets'), 'bucket')
    .where(gte(col('bucket'), fromParam))
    .build();

  // Filter active statuses by target bucket + status
  const filteredQuery = select(col('person_id'))
    .with('person_buckets', personBuckets)
    .with('prior_active', priorActive)
    .from(activeStatuses, 'classified')
    .where(and(
      eq(col('ts_bucket'), targetBucketParam),
      eq(col('status'), literal(params.status)),
    ))
    .orderBy(col('person_id'))
    .limit(params.limit, params.offset)
    .build();

  const countFilteredQuery = select(col('person_id'))
    .with('person_buckets', personBuckets)
    .with('prior_active', priorActive)
    .from(activeStatuses, 'classified')
    .where(and(
      eq(col('ts_bucket'), targetBucketParam),
      eq(col('status'), literal(params.status)),
    ))
    .build();

  const exec = new ChQueryExecutor(ch);
  const [rows, countRows] = await Promise.all([
    exec.rows<RawPersonAtBucketRow>(filteredQuery),
    exec.rows<RawPersonAtBucketRow>(countFilteredQuery),
  ]);

  return {
    person_ids: rows.map((r) => r.person_id),
    total: countRows.length,
  };
}
