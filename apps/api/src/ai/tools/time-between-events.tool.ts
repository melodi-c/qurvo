import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import {
  select,
  col,
  literal,
  namedParam,
  param,
  min,
  eq,
  gt,
  lte,
  toInt64,
  toUnixTimestamp64Milli,
  sub,
  div,
  mul,
} from '@qurvo/ch-query';
import { toChTs } from '../../analytics/query-helpers';
import { resolvedPerson } from '../../analytics/query-helpers';
import { firstEventCte } from './first-event-cte';

const argsSchema = z.object({
  event_a: z.string().describe('The starting event (e.g. "signup")'),
  event_b: z.string().describe('The target event that must occur AFTER event_a (e.g. "purchase")'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  buckets: z.number().int().min(2).max(50).nullish()
    .describe('Number of histogram buckets. Default: 10'),
  max_days: z.number().int().min(1).max(365).nullish()
    .describe('Ignore pairs with an interval longer than N days. Default: 90'),
});

const tool = defineTool({
  name: 'query_time_between_events',
  description:
    'Analyzes the distribution of time elapsed between two events for each user. ' +
    'For each user finds the first occurrence of event_a and the first occurrence of event_b AFTER event_a. ' +
    'Returns a histogram of time intervals (bucket labels + user counts) plus summary statistics: ' +
    'median, p75, p90, mean, min, max. ' +
    'Use for questions like "How long does it take users to go from signup to first purchase?" ' +
    'or "What is the time between registration and activation?".',
  schema: argsSchema,
  visualizationType: 'histogram_chart',
});

interface RawPairRow {
  pid: string;
  diff_seconds: string;
}

interface HistogramBucket {
  label: string;
  from_seconds: number;
  to_seconds: number;
  count: number;
}

export interface TimeBetweenEventsResult {
  event_a: string;
  event_b: string;
  date_from: string;
  date_to: string;
  total_users: number;
  buckets: HistogramBucket[];
  stats: {
    mean_seconds: number;
    median_seconds: number;
    p75_seconds: number;
    p90_seconds: number;
    min_seconds: number;
    max_seconds: number;
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return minutes <= 1 ? '< 1 min' : `${minutes} min`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return `${hours}h`;
  }
  const days = Math.round(seconds / 86400);
  return `${days}d`;
}

function buildHistogram(
  diffs: number[],
  bucketCount: number,
  maxSeconds: number,
): HistogramBucket[] {
  if (diffs.length === 0) {return [];}

  const minVal = Math.min(...diffs);
  const maxVal = Math.min(Math.max(...diffs), maxSeconds);

  const step = (maxVal - minVal) / bucketCount;
  const buckets: HistogramBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    label: `${formatDuration(minVal + i * step)}\u2013${formatDuration(minVal + (i + 1) * step)}`,
    from_seconds: Math.round(minVal + i * step),
    to_seconds: Math.round(minVal + (i + 1) * step),
    count: 0,
  }));

  for (const diff of diffs) {
    const idx = Math.min(
      Math.floor((diff - minVal) / step),
      bucketCount - 1,
    );
    buckets[idx].count++;
  }

  return buckets;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {return 0;}
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

@Injectable()
export class TimeBetweenEventsTool implements AiTool {
  readonly name = tool.name;
  readonly cacheable = true;

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
  ) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, _userId, projectId) => {
    const bucketCount = args.buckets ?? 10;
    const maxDays = args.max_days ?? 90;
    const maxSeconds = maxDays * 86400;
    const fromTs = toChTs(args.date_from);
    const toTs = toChTs(args.date_to, true);

    // CTE: first occurrence of event_a per user
    const firstANode = firstEventCte({
      projectId,
      eventName: args.event_a,
      from: fromTs,
      to: toTs,
    });

    // CTE: first occurrence of event_b AFTER event_a, within max_seconds
    const firstBNode = select(
      resolvedPerson().as('pid'),
      min(col('e.timestamp')).as('end_ts'),
    )
      .from('events', 'e')
      .join('INNER', 'first_a', undefined, eq(resolvedPerson(), col('first_a.pid')))
      .where(
        eq(col('e.project_id'), namedParam('project_id', 'UUID', projectId)),
        eq(col('e.event_name'), namedParam('event_b', 'String', args.event_b)),
        gt(col('e.timestamp'), col('first_a.start_ts')),
        lte(col('e.timestamp'), param('DateTime64(3)', toTs)),
        lte(
          sub(toUnixTimestamp64Milli(col('e.timestamp')), toUnixTimestamp64Milli(col('first_a.start_ts'))),
          mul(toInt64(namedParam('max_seconds', 'UInt64', maxSeconds)), literal(1000)),
        ),
      )
      .groupBy(col('pid'))
      .build();

    // Final query: compute diff_seconds for each qualifying pair
    const query = select(
      col('first_a.pid').as('pid'),
      toInt64(
        div(
          sub(toUnixTimestamp64Milli(col('first_b.end_ts')), toUnixTimestamp64Milli(col('first_a.start_ts'))),
          literal(1000),
        ),
      ).as('diff_seconds'),
    )
      .from('first_a')
      .join('INNER', 'first_b', undefined, eq(col('first_a.pid'), col('first_b.pid')))
      .with('first_a', firstANode)
      .with('first_b', firstBNode)
      .build();

    const rows = await new ChQueryExecutor(this.ch).rows<RawPairRow>(query);

    const diffs = rows
      .map((r) => Number(r.diff_seconds))
      .filter((d) => d >= 0 && d <= maxSeconds);

    diffs.sort((a, b) => a - b);

    const totalUsers = diffs.length;

    const stats = {
      mean_seconds: totalUsers > 0 ? Math.round(diffs.reduce((s, d) => s + d, 0) / totalUsers) : 0,
      median_seconds: percentile(diffs, 50),
      p75_seconds: percentile(diffs, 75),
      p90_seconds: percentile(diffs, 90),
      min_seconds: totalUsers > 0 ? diffs[0] : 0,
      max_seconds: totalUsers > 0 ? diffs[diffs.length - 1] : 0,
    };

    const buckets = buildHistogram(diffs, bucketCount, maxSeconds);

    const result: TimeBetweenEventsResult = {
      event_a: args.event_a,
      event_b: args.event_b,
      date_from: args.date_from,
      date_to: args.date_to,
      total_users: totalUsers,
      buckets,
      stats,
    };

    return result;
  });
}
