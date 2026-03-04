import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import {
  col, eq, select,
} from '@qurvo/ch-query';
import {
  analyticsWhere, bucket, resolvedPerson, tsParam,
  type PropertyFilter,
} from '../analytics/query-helpers';
import type { Granularity } from '../analytics/query-helpers';

export interface PersonsAtTrendBucketParams {
  project_id: string;
  event_name: string;
  granularity: Granularity;
  /** The bucket start date (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss). */
  bucket: string;
  date_from: string;
  date_to: string;
  timezone: string;
  filters?: PropertyFilter[];
}

interface RawPersonRow {
  person_id: string;
}

/**
 * Returns distinct person IDs that triggered `event_name` in a specific
 * time bucket within the given date range.
 *
 * SQL equivalent:
 * ```sql
 * SELECT DISTINCT resolvedPerson() AS person_id
 * FROM events
 * WHERE project_id = {p} AND event_name = {e}
 *   AND timestamp BETWEEN date_from AND date_to
 *   AND toStartOfDay/Week/Month(timestamp, tz) = {bucket}
 * GROUP BY person_id
 * ```
 */
export async function queryPersonsAtTrendBucket(
  ch: ClickHouseClient,
  params: PersonsAtTrendBucketParams,
): Promise<string[]> {
  const bucketExpr = bucket(params.granularity, 'timestamp', params.timezone);
  const bucketParam = tsParam(params.bucket, params.timezone);

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
      eq(bucketExpr, bucketParam),
    )
    .groupBy(col('person_id'))
    .build();

  const rows = await new ChQueryExecutor(ch).rows<RawPersonRow>(query);
  return rows.map((r) => r.person_id);
}
