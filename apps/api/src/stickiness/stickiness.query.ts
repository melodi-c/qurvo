import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortDefinition } from '@qurvo/db';
import { buildCohortFilterClause } from '../cohorts/cohorts.query';
import { toChTs, RESOLVED_PERSON } from '../utils/clickhouse-helpers';

function granularityTruncFn(granularity: StickinessGranularity): string {
  switch (granularity) {
    case 'day': return 'toStartOfDay';
    case 'week': return 'toStartOfWeek';
    case 'month': return 'toStartOfMonth';
  }
}

// ── Public types ─────────────────────────────────────────────────────────────

export type StickinessGranularity = 'day' | 'week' | 'month';

export interface StickinessQueryParams {
  project_id: string;
  target_event: string;
  granularity: StickinessGranularity;
  date_from: string;
  date_to: string;
  cohort_filters?: CohortDefinition[];
}

export interface StickinessDataPoint {
  period_count: number;
  user_count: number;
}

export interface StickinessQueryResult {
  granularity: StickinessGranularity;
  total_periods: number;
  data: StickinessDataPoint[];
}

// ── Compute total periods ────────────────────────────────────────────────────

export function computeTotalPeriods(from: string, to: string, granularity: StickinessGranularity): number {
  const d1 = new Date(`${from}T00:00:00Z`);
  const d2 = new Date(`${to}T00:00:00Z`);

  switch (granularity) {
    case 'day': {
      const diffMs = d2.getTime() - d1.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    }
    case 'week': {
      const diffMs = d2.getTime() - d1.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)) + 1;
    }
    case 'month': {
      return (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth()) + 1;
    }
  }
}

// ── Raw row type ─────────────────────────────────────────────────────────────

interface RawStickinessRow {
  active_periods: string;
  user_count: string;
}

// ── Core query ───────────────────────────────────────────────────────────────

export async function queryStickiness(
  ch: ClickHouseClient,
  params: StickinessQueryParams,
): Promise<StickinessQueryResult> {
  const queryParams: Record<string, unknown> = {
    project_id: params.project_id,
    target_event: params.target_event,
  };

  queryParams['from'] = toChTs(params.date_from);
  queryParams['to'] = toChTs(params.date_to, true);

  const truncFn = granularityTruncFn(params.granularity);
  const truncExpr = params.granularity === 'week'
    ? `${truncFn}(timestamp, 1)`
    : `${truncFn}(timestamp)`;

  const cohortClause = params.cohort_filters?.length
    ? ' AND ' + buildCohortFilterClause(params.cohort_filters, 'project_id', queryParams)
    : '';

  const sql = `
    WITH person_active_periods AS (
      SELECT ${RESOLVED_PERSON} AS person_id,
             uniqExact(${truncExpr}) AS active_periods
      FROM events FINAL
      WHERE project_id = {project_id:UUID}
        AND event_name = {target_event:String}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}${cohortClause}
      GROUP BY person_id
    )
    SELECT active_periods, count() AS user_count
    FROM person_active_periods
    GROUP BY active_periods
    ORDER BY active_periods`;

  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawStickinessRow>();

  const totalPeriods = computeTotalPeriods(params.date_from, params.date_to, params.granularity);

  const data: StickinessDataPoint[] = rows.map((row) => ({
    period_count: Number(row.active_periods),
    user_count: Number(row.user_count),
  }));

  return {
    granularity: params.granularity,
    total_periods: totalPeriods,
    data,
  };
}
