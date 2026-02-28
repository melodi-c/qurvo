import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import { toChTs, RESOLVED_PERSON } from '../../utils/clickhouse-helpers';

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
    label: `${formatDuration(minVal + i * step)}–${formatDuration(minVal + (i + 1) * step)}`,
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

    const queryParams: Record<string, unknown> = {
      project_id: projectId,
      from: toChTs(args.date_from),
      to: toChTs(args.date_to, true),
      event_a: args.event_a,
      event_b: args.event_b,
      max_seconds: maxSeconds,
    };

    // Strategy:
    // 1. Per user: find first occurrence of event_a in date range (start_ts)
    // 2. Per user: find first occurrence of event_b AFTER start_ts and within max_seconds
    // 3. Return diff_seconds for each qualifying pair
    //
    // We avoid FINAL and use IN/NOT IN patterns per ClickHouse gotchas.
    // CTEs are not materialised — use minimal references.
    const sql = `
      WITH
        first_a AS (
          SELECT
            ${RESOLVED_PERSON} AS pid,
            min(timestamp) AS start_ts
          FROM events
          WHERE
            project_id = {project_id:UUID}
            AND event_name = {event_a:String}
            AND timestamp >= {from:DateTime64(3)}
            AND timestamp <= {to:DateTime64(3)}
          GROUP BY pid
        ),
        first_b AS (
          SELECT
            ${RESOLVED_PERSON} AS pid,
            min(e.timestamp) AS end_ts
          FROM events e
          INNER JOIN first_a ON ${RESOLVED_PERSON} = first_a.pid
          WHERE
            e.project_id = {project_id:UUID}
            AND e.event_name = {event_b:String}
            AND e.timestamp > first_a.start_ts
            AND e.timestamp <= {to:DateTime64(3)}
            AND toUnixTimestamp64Milli(e.timestamp) - toUnixTimestamp64Milli(first_a.start_ts)
                <= toInt64({max_seconds:UInt64}) * 1000
          GROUP BY pid
        )
      SELECT
        first_a.pid AS pid,
        toInt64(
          (toUnixTimestamp64Milli(first_b.end_ts) - toUnixTimestamp64Milli(first_a.start_ts)) / 1000
        ) AS diff_seconds
      FROM first_a
      INNER JOIN first_b ON first_a.pid = first_b.pid
    `;

    const res = await this.ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await res.json<RawPairRow>();

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
