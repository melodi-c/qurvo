import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import {
  select,
  unionAll,
  col,
  literal,
  alias,
  and,
  eq,
  gte,
  has,
  lte,
  not,
  multiIf,
  uniqExact,
  toString,
  notInSubquery,
} from '@qurvo/ch-query';
import type { PropertyFilter } from '../query-helpers';
import { buildLifecycleCTEs } from './lifecycle-ctes';

// Public types

export type LifecycleGranularity = 'day' | 'week' | 'month';
export type LifecycleStatus = 'new' | 'returning' | 'resurrecting' | 'dormant';

export interface LifecycleQueryParams {
  project_id: string;
  target_event: string;
  granularity: LifecycleGranularity;
  date_from: string;
  date_to: string;
  filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
  timezone: string;
}

export interface LifecycleDataPoint {
  bucket: string;
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export interface LifecycleQueryResult {
  granularity: LifecycleGranularity;
  data: LifecycleDataPoint[];
  totals: {
    new: number;
    returning: number;
    resurrecting: number;
    dormant: number;
  };
}

// Raw row type

interface RawLifecycleRow {
  period: string;
  status: string;
  count: string;
}

// Result assembly

function assembleLifecycleResult(
  rows: RawLifecycleRow[],
  granularity: LifecycleGranularity,
): LifecycleQueryResult {
  const bucketMap = new Map<string, LifecycleDataPoint>();

  for (const row of rows) {
    const b = row.period;
    if (!bucketMap.has(b)) {
      bucketMap.set(b, { bucket: b, new: 0, returning: 0, resurrecting: 0, dormant: 0 });
    }
    const point = bucketMap.get(b);
    if (!point) { continue; }
    const count = Number(row.count);
    const status = row.status as LifecycleStatus;
    if (status === 'dormant') {
      point.dormant = -Math.abs(count);
    } else {
      point[status] = count;
    }
  }

  const data = [...bucketMap.values()].sort((a, c) => a.bucket.localeCompare(c.bucket));

  const totals = { new: 0, returning: 0, resurrecting: 0, dormant: 0 };
  for (const point of data) {
    totals.new += point.new;
    totals.returning += point.returning;
    totals.resurrecting += point.resurrecting;
    totals.dormant += point.dormant;
  }

  return { granularity, data, totals };
}

// Core query

export async function queryLifecycle(
  ch: ClickHouseClient,
  params: LifecycleQueryParams,
): Promise<LifecycleQueryResult> {
  const {
    personBuckets,
    priorActive,
    prevBucketExpr,
    nextBucketExpr,
    fromParam,
    toParam,
    priorActiveRef,
  } = buildLifecycleCTEs(params);

  const activeStatuses = select(
    col('person_id'),
    col('bucket').as('ts_bucket'),
    multiIf(
      [
        {
          // 'new': first appearance in the extended window AND no prior history at all
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

  // Dormant: users active in period N but not in period N+1
  const dormant = select(
    col('person_id'),
    alias(nextBucketExpr, 'ts_bucket'),
    literal('dormant').as('status'),
  )
    .from('person_buckets')
    .arrayJoin(col('buckets'), 'bucket')
    .where(and(
      not(has(col('buckets'), nextBucketExpr)),
      gte(nextBucketExpr, fromParam),
      lte(nextBucketExpr, toParam),
    ))
    .build();

  // Outer query: aggregate by bucket + status
  const query = select(
    toString(col('ts_bucket')).as('period'),
    col('status'),
    uniqExact(col('person_id')).as('count'),
  )
    .with('person_buckets', personBuckets)
    .with('prior_active', priorActive)
    .from(unionAll(activeStatuses, dormant))
    .groupBy(col('ts_bucket'), col('status'))
    .orderBy(col('ts_bucket'))
    .orderBy(col('status'))
    .build();

  const rows = await new ChQueryExecutor(ch).rows<RawLifecycleRow>(query);
  return assembleLifecycleResult(rows, params.granularity);
}
