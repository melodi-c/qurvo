import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import {
  select,
  unionAll,
  col,
  literal,
  param,
  min,
  and,
  dateDiff,
  eq,
  gte,
  lte,
  toInt32,
  uniqExact,
  toString as chToString,
} from '@qurvo/ch-query';
import {
  resolvedPerson,
  bucket,
  bucketOfMin,
  tsParam,
  toChTs,
  shiftDate,
  truncateDate,
  analyticsWhere,
  projectIs,
  eventIs,
  cohortFilter,
  cohortBounds,
  type PropertyFilter,
} from '../query-helpers';

// Public types

export type RetentionType = 'first_time' | 'recurring';
export type RetentionGranularity = 'day' | 'week' | 'month';

export interface RetentionQueryParams {
  project_id: string;
  target_event: string;
  /** Optional separate event to track as the return event. Defaults to target_event when omitted. */
  return_event?: string;
  retention_type: RetentionType;
  granularity: RetentionGranularity;
  periods: number;
  date_from: string;
  date_to: string;
  filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
  timezone: string;
}

export interface RetentionCohort {
  cohort_date: string;
  cohort_size: number;
  periods: number[];
}

export interface RetentionQueryResult {
  retention_type: RetentionType;
  granularity: RetentionGranularity;
  cohorts: RetentionCohort[];
  average_retention: number[];
}

// Raw row type

interface RawRetentionRow {
  cohort_period: string;
  period_offset: string;
  user_count: string;
}

// Result assembly

function assembleResult(
  rows: RawRetentionRow[],
  params: RetentionQueryParams,
): RetentionQueryResult {
  // Separate cohort-size sentinel rows (period_offset = -1) from retention rows.
  // Sentinel rows carry the true cohort size computed from initial_events directly,
  // independent of the INNER JOIN with return_events.
  const cohortSizeMap = new Map<string, number>();
  const cohortMap = new Map<string, number[]>();
  for (const row of rows) {
    const key = row.cohort_period;
    const offset = Number(row.period_offset);
    if (offset === -1) {
      // Sentinel row: true cohort size from initial_events
      cohortSizeMap.set(key, Number(row.user_count));
      // Ensure this cohort_period key exists in cohortMap even if there are no return rows
      if (!cohortMap.has(key)) {
        cohortMap.set(key, new Array(params.periods + 1).fill(0));
      }
      continue;
    }
    if (!cohortMap.has(key)) {
      cohortMap.set(key, new Array(params.periods + 1).fill(0));
    }
    if (offset >= 0 && offset <= params.periods) {
      const periods = cohortMap.get(key);
      if (periods) { periods[offset] = Number(row.user_count); }
    }
  }

  // Sort by date
  const sortedKeys = [...cohortMap.keys()].sort();
  const cohorts: RetentionCohort[] = sortedKeys.map((key) => ({
    cohort_date: key,
    cohort_size: cohortSizeMap.get(key) ?? (cohortMap.get(key)?.[0] ?? 0),
    periods: cohortMap.get(key) ?? [],
  }));

  // Compute weighted average retention % (weighted by cohort size).
  // Only cohorts that have had enough time to reach a given offset contribute
  // to the denominator. A cohort with date D has "matured" to offset N when
  // shiftDate(D, N, granularity) <= truncTo (the start of the date_to period).
  // Including immature cohorts in the denominator systematically underreports
  // retention because their cohort_size is counted against zero returns.
  const truncTo = truncateDate(params.date_to, params.granularity);
  const average_retention: number[] = [];
  for (let offset = 0; offset <= params.periods; offset++) {
    let totalReturned = 0;
    let totalSize = 0;
    for (const cohort of cohorts) {
      if (cohort.cohort_size > 0) {
        // Check whether this cohort has reached offset N:
        // the period at (cohort_date + N * granularity) must be <= date_to (truncated).
        const cohortDateStr = cohort.cohort_date.slice(0, 10);
        const periodDate = shiftDate(cohortDateStr, offset, params.granularity);
        if (periodDate <= truncTo) {
          totalReturned += cohort.periods[offset];
          totalSize += cohort.cohort_size;
        }
      }
    }
    average_retention.push(totalSize > 0 ? Math.round((totalReturned / totalSize) * 100 * 100) / 100 : 0);
  }

  return {
    retention_type: params.retention_type,
    granularity: params.granularity,
    cohorts,
    average_retention,
  };
}

// Core query

export async function queryRetention(
  ch: ClickHouseClient,
  params: RetentionQueryParams,
): Promise<RetentionQueryResult> {
  const tz = params.timezone;
  const returnEventName = params.return_event ?? params.target_event;

  const truncFrom = truncateDate(params.date_from, params.granularity);
  const truncTo = truncateDate(params.date_to, params.granularity);
  const extendedTo = shiftDate(truncTo, params.periods, params.granularity);

  const truncFromTs = toChTs(truncFrom);
  const truncToTs = toChTs(truncTo, true);
  const extendedToTs = toChTs(extendedTo, true);

  const { dateTo, dateFrom } = cohortBounds(params);
  const unit = params.granularity;

  // initial_events CTE
  // Depends on retention_type: recurring vs first_time

  let initialCte;

  if (params.retention_type === 'recurring') {
    // Recurring: each period the person is active counts as an initial event
    initialCte = select(
      resolvedPerson().as('person_id'),
      bucket(params.granularity, 'timestamp', tz).as('cohort_period'),
    )
      .from('events')
      .where(analyticsWhere({
        projectId: params.project_id,
        from: truncFromTs,
        to: truncToTs,
        tz,
        eventName: params.target_event,
        filters: params.filters,
        cohortFilters: params.cohort_filters,
        dateTo,
        dateFrom,
      }))
      .groupBy(col('person_id'), col('cohort_period'))
      .build();
  } else {
    // First-time: only the first ever occurrence of the event counts as the cohort date.
    // Property filters are NOT applied here — the cohort date is the true first event,
    // regardless of its properties. Filters are applied only to return_events.
    //
    // Performance note: we cannot safely add a lower-bound timestamp filter to this scan.
    // A user whose very first event predates date_from must be EXCLUDED from the cohort
    // (their min(timestamp) < date_from → the outer HAVING filters them out).
    //
    // Optimisation path: migration 0008 adds an aggregate projection. The HAVING clause
    // uses `min(timestamp)` directly so ClickHouse can read precomputed per-person minimums.
    initialCte = select(
      resolvedPerson().as('person_id'),
      bucketOfMin(params.granularity, 'timestamp', tz).as('cohort_period'),
    )
      .from('events')
      .where(and(
        projectIs(params.project_id),
        eventIs(params.target_event),
        cohortFilter(
          params.cohort_filters,
          params.project_id,
          dateTo,
          dateFrom,
        ),
      ))
      .groupBy(col('person_id'))
      .having(and(
        gte(min(col('timestamp')), tsParam(truncFromTs, tz)),
        lte(min(col('timestamp')), tsParam(truncToTs, tz)),
      ))
      .build();
  }

  // return_events CTE
  const returnCte = select(
    resolvedPerson().as('person_id'),
    bucket(params.granularity, 'timestamp', tz).as('return_period'),
  )
    .from('events')
    .where(analyticsWhere({
      projectId: params.project_id,
      from: truncFromTs,
      to: extendedToTs,
      tz,
      eventName: returnEventName,
      filters: params.filters,
      cohortFilters: params.cohort_filters,
      dateTo,
      dateFrom,
    }))
    .groupBy(col('person_id'), col('return_period'))
    .build();

  // retention_raw CTE ── INNER JOIN initial × return
  const retentionRaw = select(
    col('i.cohort_period'),
    col('i.person_id'),
    dateDiff(unit, col('i.cohort_period'), col('r.return_period')).as('period_offset'),
  )
    .from('initial_events', 'i')
    .innerJoin('return_events', 'r', eq(col('i.person_id'), col('r.person_id')))
    .where(
      gte(col('r.return_period'), col('i.cohort_period')),
      lte(
        dateDiff(unit, col('i.cohort_period'), col('r.return_period')),
        param('UInt32', params.periods),
      ),
    )
    .build();

  // Sentinel rows (cohort size, period_offset = -1)
  const sentinelQuery = select(
    chToString(col('cohort_period')).as('cohort_period'),
    toInt32(literal(-1)).as('period_offset'),
    uniqExact(col('person_id')).as('user_count'),
  )
    .from('initial_events')
    .groupBy(col('cohort_period'))
    .build();

  // Retention period rows (period_offset >= 0)
  const retentionQuery = select(
    chToString(col('cohort_period')).as('cohort_period'),
    col('period_offset'),
    uniqExact(col('person_id')).as('user_count'),
  )
    .from('retention_raw')
    .groupBy(col('cohort_period'), col('period_offset'))
    .orderBy(col('cohort_period'))
    .orderBy(col('period_offset'))
    .build();

  // Final query with CTEs and UNION ALL
  const query = select(col('cohort_period'), col('period_offset'), col('user_count'))
    .with('initial_events', initialCte)
    .with('return_events', returnCte)
    .with('retention_raw', retentionRaw)
    .from(unionAll(sentinelQuery, retentionQuery))
    .build();

  const rows = await new ChQueryExecutor(ch).rows<RawRetentionRow>(query);
  return assembleResult(rows, params);
}
