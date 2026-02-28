import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import type { AliasExpr, Expr, SelectNode } from '@qurvo/ch-query';
import {
  compile,
  select,
  unionAll,
  col,
  raw,
  func,
  and,
  eq,
  gte,
  lt,
  lte,
  not,
  multiIf,
  uniqExact,
  toString,
  notInSubquery,
  arraySort,
  resolvedPerson,
  analyticsWhere,
  projectIs,
  eventIs,
  cohortFilter,
  tsParam,
  toChTs,
  shiftDate,
  truncateDate,
  bucket,
  neighborBucket,
} from '@qurvo/ch-query';
import type { PropertyFilter } from '@qurvo/ch-query';

// ── Public types ─────────────────────────────────────────────────────────────

export type LifecycleGranularity = 'day' | 'week' | 'month';
export type LifecycleStatus = 'new' | 'returning' | 'resurrecting' | 'dormant';

export interface LifecycleQueryParams {
  project_id: string;
  target_event: string;
  granularity: LifecycleGranularity;
  date_from: string;
  date_to: string;
  event_filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
  timezone?: string;
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

// ── Raw row type ─────────────────────────────────────────────────────────────

interface RawLifecycleRow {
  period: string;
  status: string;
  count: string;
}

// ── Result assembly ──────────────────────────────────────────────────────────

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
    const point = bucketMap.get(b)!;
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

// ── Alias helper ─────────────────────────────────────────────────────────────

function alias(expr: Expr, name: string): AliasExpr {
  return { type: 'alias', expr, alias: name };
}

// ── Core query ───────────────────────────────────────────────────────────────
//
// Two-CTE approach:
//   person_buckets  — per-person sorted bucket array over [extended_from, to].
//                     extended_from = date_from - 1 period gives the 'returning'
//                     classifier one look-back period.
//   prior_active    — users with any matching event strictly before extended_from.
//                     Used to distinguish truly 'new' users from users who are
//                     'resurrecting' after a long absence (> 1 period).
//
// Classification rules per bucket:
//   new         — first_bucket in extended window AND no prior history
//   returning   — active in the immediately preceding period
//   resurrecting — was active at some earlier point but not in the preceding period
//   dormant     — was active in period N but not in period N+1 (emitted for N+1)

export async function queryLifecycle(
  ch: ClickHouseClient,
  params: LifecycleQueryParams,
): Promise<LifecycleQueryResult> {
  const tz = params.timezone;
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
    arraySort(func('groupUniqArray', bucketExpr)).as('buckets'),
    func('min', bucketExpr).as('first_bucket'),
  )
    .from('events')
    .where(
      analyticsWhere({
        projectId: params.project_id,
        from: extendedFrom,
        to: params.date_to,
        tz,
        eventName: params.target_event,
        filters: params.event_filters,
        cohortFilters: params.cohort_filters,
        dateTo: toChTs(params.date_to, true),
        dateFrom: toChTs(params.date_from),
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
      lt(raw('timestamp'), tsParam(extendedFrom, tz)),
      cohortFilter(
        params.cohort_filters,
        params.project_id,
        toChTs(params.date_to, true),
        toChTs(params.date_from),
      ),
    ))
    .groupBy(col('person_id'))
    .build();

  // Active statuses: ARRAY JOIN buckets → classify via multiIf
  const fromParam = tsParam(params.date_from, tz);
  const toParam = tsParam(toChTs(params.date_to, true), tz);

  // Reference the prior_active CTE by name for the NOT IN subquery
  const priorActiveRef = select(col('person_id')).from('prior_active').build();

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
          result: raw("'new'"),
        },
        {
          condition: func('has', col('buckets'), prevBucketExpr),
          result: raw("'returning'"),
        },
      ],
      raw("'resurrecting'"),
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
    raw("'dormant'").as('status'),
  )
    .from('person_buckets')
    .arrayJoin(col('buckets'), 'bucket')
    .where(and(
      not(func('has', col('buckets'), nextBucketExpr)),
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
    // Cast: compiler.compileQuery() handles UnionAllNode correctly in FROM position;
    // the SelectNode type constraint on .from() is narrower than what the runtime supports.
    .from(unionAll(activeStatuses, dormant) as unknown as SelectNode)
    .groupBy(col('ts_bucket'), col('status'))
    .orderBy(col('ts_bucket'))
    .orderBy(col('status'))
    .build();

  const compiled = compile(query);
  const result = await ch.query({
    query: compiled.sql,
    query_params: compiled.params,
    format: 'JSONEachRow',
  });
  const rows = await result.json<RawLifecycleRow>();
  return assembleLifecycleResult(rows, params.granularity);
}
