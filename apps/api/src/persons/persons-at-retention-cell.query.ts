import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
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
  uniqExact,
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
} from '../analytics/query-helpers';

export type RetentionType = 'first_time' | 'recurring';
export type RetentionGranularity = 'day' | 'week' | 'month';

export interface PersonsAtRetentionCellParams {
  project_id: string;
  target_event: string;
  return_event?: string;
  retention_type: RetentionType;
  granularity: RetentionGranularity;
  periods: number;
  date_from: string;
  date_to: string;
  /** The specific cohort date to filter on (ISO date string, e.g. "2026-03-01") */
  cohort_date: string;
  /** The period offset to filter on (0 = cohort period, 1 = next period, etc.) */
  period_offset: number;
  filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
  timezone: string;
  limit: number;
  offset: number;
}

interface RawPersonAtCellRow {
  person_id: string;
}

/**
 * Finds person IDs at a specific retention cell (cohort_date + period_offset).
 *
 * Reconstructs the same CTE structure from retention.query.ts:
 *   initial_events  -> persons who entered the cohort (recurring or first_time)
 *   return_events   -> persons who returned with the return event
 *   retention_raw   -> INNER JOIN of initial x return, with period_offset = dateDiff
 *
 * Then filters to the specific cohort_date + period_offset and returns person_ids.
 */
export async function queryPersonsAtRetentionCell(
  ch: ClickHouseClient,
  params: PersonsAtRetentionCellParams,
): Promise<{ person_ids: string[]; total: number }> {
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

  // initial_events CTE — same logic as retention.query.ts
  let initialCte;

  if (params.retention_type === 'recurring') {
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

  // Target cohort_date as a timestamp param for comparison
  const cohortDateParam = tsParam(params.cohort_date, tz);

  // Filtered query: persons at specific cohort_date + period_offset
  const filteredQuery = select(col('person_id'))
    .with('initial_events', initialCte)
    .with('return_events', returnCte)
    .with('retention_raw', retentionRaw)
    .from('retention_raw')
    .where(and(
      eq(col('cohort_period'), cohortDateParam),
      eq(col('period_offset'), param('UInt32', params.period_offset)),
    ))
    .groupBy(col('person_id'))
    .orderBy(col('person_id'))
    .limit(params.limit).offset(params.offset)
    .build();

  // Count query
  const countQuery = select(uniqExact(col('person_id')).as('total'))
    .with('initial_events', initialCte)
    .with('return_events', returnCte)
    .with('retention_raw', retentionRaw)
    .from('retention_raw')
    .where(and(
      eq(col('cohort_period'), cohortDateParam),
      eq(col('period_offset'), param('UInt32', params.period_offset)),
    ))
    .build();

  const exec = new ChQueryExecutor(ch);
  const [rows, countRows] = await Promise.all([
    exec.rows<RawPersonAtCellRow>(filteredQuery),
    exec.rows<{ total: string }>(countQuery),
  ]);

  return {
    person_ids: rows.map((r) => r.person_id),
    total: Number(countRows[0]?.total ?? 0),
  };
}
