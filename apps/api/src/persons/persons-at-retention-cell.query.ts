import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import {
  select,
  col,
  param,
  and,
  eq,
  uniqExact,
} from '@qurvo/ch-query';
import {
  tsParam,
  type PropertyFilter,
} from '../analytics/query-helpers';
import { buildRetentionCTEs } from '../analytics/retention/retention-ctes';

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
 * Uses buildRetentionCTEs() to obtain the shared initial_events, return_events,
 * and retention_raw CTE queries, then filters to the specific cohort_date +
 * period_offset and returns person_ids.
 */
export async function queryPersonsAtRetentionCell(
  ch: ClickHouseClient,
  params: PersonsAtRetentionCellParams,
): Promise<{ person_ids: string[]; total: number }> {
  const tz = params.timezone;

  const { initialCte, returnCte, retentionRaw } = buildRetentionCTEs(params);

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
