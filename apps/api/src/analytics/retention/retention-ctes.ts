import type { QueryNode } from '@qurvo/ch-query';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import {
  select,
  col,
  param,
  min,
  and,
  dateDiff,
  eq,
  gte,
  lte,
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

// ── Public types ────────────────────────────────────────────────────────────

export type RetentionType = 'first_time' | 'recurring';
export type RetentionGranularity = 'day' | 'week' | 'month';

export interface RetentionCTEParams {
  project_id: string;
  target_event: string;
  /** Optional separate return event. Defaults to target_event when omitted. */
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

export interface RetentionCTEResult {
  /** initial_events CTE query */
  initialCte: QueryNode;
  /** return_events CTE query */
  returnCte: QueryNode;
  /** retention_raw CTE query (INNER JOIN initial x return) */
  retentionRaw: QueryNode;
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds the three retention CTEs (initial_events, return_events, retention_raw)
 * shared by both the analytics query (`retention.query.ts`) and the persons-at
 * drill-down query (`persons-at-retention-cell.query.ts`).
 */
export function buildRetentionCTEs(params: RetentionCTEParams): RetentionCTEResult {
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

  // initial_events CTE — depends on retention_type
  let initialCte: QueryNode;

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
        tsColumn: col('timestamp'),
        dateTo,
        dateFrom,
      }))
      .groupBy(col('person_id'), col('cohort_period'))
      .build();
  } else {
    // First-time: only the first ever occurrence counts as the cohort date.
    // Property filters are NOT applied here — the cohort date is the true first event.
    // Performance note: migration 0008 adds an aggregate projection for min(timestamp).
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
      tsColumn: col('timestamp'),
      dateTo,
      dateFrom,
    }))
    .groupBy(col('person_id'), col('return_period'))
    .build();

  // retention_raw CTE — INNER JOIN initial x return
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

  return { initialCte, returnCte, retentionRaw };
}
