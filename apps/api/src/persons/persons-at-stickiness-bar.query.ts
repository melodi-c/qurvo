import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import {
  col, eq, param, select, uniqExact,
} from '@qurvo/ch-query';
import {
  analyticsWhere, bucket, resolvedPerson,
  type PropertyFilter,
} from '../analytics/query-helpers';
import type { StickinessGranularity } from '../analytics/stickiness/stickiness.query';

export interface PersonsAtStickinessBarParams {
  project_id: string;
  event_name: string;
  granularity: StickinessGranularity;
  /** The exact number of active periods to match. */
  period_count: number;
  date_from: string;
  date_to: string;
  timezone: string;
  filters?: PropertyFilter[];
}

interface RawPersonRow {
  person_id: string;
}

/**
 * Returns person IDs that have exactly `period_count` active periods
 * (days/weeks/months) within the given date range.
 *
 * SQL equivalent:
 * ```sql
 * SELECT resolvedPerson() AS person_id
 * FROM events
 * WHERE project_id = {p} AND event_name = {e} AND timestamp BETWEEN ...
 * GROUP BY person_id
 * HAVING uniqExact(toStartOfDay/Week/Month(timestamp, tz)) = {period_count}
 * ```
 */
export async function queryPersonsAtStickinessBar(
  ch: ClickHouseClient,
  params: PersonsAtStickinessBarParams,
): Promise<string[]> {
  const bucketExpr = bucket(params.granularity, 'timestamp', params.timezone);

  const query = select(
    resolvedPerson().as('person_id'),
  )
    .from('events')
    .where(
      analyticsWhere({
        projectId: params.project_id,
        from: params.date_from,
        to: params.date_to,
        tz: params.timezone,
        eventName: params.event_name,
        filters: params.filters,
        tsColumn: col('timestamp'),
      }),
    )
    .groupBy(col('person_id'))
    .having(eq(uniqExact(bucketExpr), param('UInt64', params.period_count)))
    .build();

  const rows = await new ChQueryExecutor(ch).rows<RawPersonRow>(query);
  return rows.map((r) => r.person_id);
}
