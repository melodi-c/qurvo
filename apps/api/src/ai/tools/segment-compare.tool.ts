import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { defineTool, propertyFilterSchema } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import { compile, select } from '@qurvo/ch-query';
import {
  analyticsWhere,
  baseMetricColumns,
  toChTs,
  type PropertyFilter,
} from '../../analytics/query-helpers';
import { computeMetricValue } from './metric.utils';

const argsSchema = z.object({
  event_name: z.string().describe('Name of the event to analyze (e.g. "purchase", "signup")'),
  metric: z.enum(['unique_users', 'total_events', 'events_per_user']).describe(
    'Aggregation metric: unique_users (distinct person count), total_events (raw count), events_per_user (ratio)',
  ),
  date_from: z.string().describe('Start date in YYYY-MM-DD format'),
  date_to: z.string().describe('End date in YYYY-MM-DD format'),
  segment_a_filters: z.array(propertyFilterSchema).min(1).describe(
    'Filters defining segment A. Use "properties.<key>" for event properties or direct columns like "country", "device_type"',
  ),
  segment_b_filters: z.array(propertyFilterSchema).min(1).describe(
    'Filters defining segment B. Use "properties.<key>" for event properties or direct columns like "country", "device_type"',
  ),
  segment_a_name: z.string().nullish().describe('Display name for segment A (default: "Segment A")'),
  segment_b_name: z.string().nullish().describe('Display name for segment B (default: "Segment B")'),
});

const tool = defineTool({
  name: 'compare_segments',
  description:
    'Compares a metric between two user segments (A vs B analysis). ' +
    'Each segment is defined by its own set of property filters. ' +
    'Returns metric values for A and B, absolute and relative difference. ' +
    'Use when the user asks "compare X between paid and free users", ' +
    '"how do mobile vs desktop users differ on Y?", ' +
    'or "A/B comparison of segment performance".',
  schema: argsSchema,
  visualizationType: 'segment_compare_chart',
});

interface RawRow {
  raw_value: string;
  uniq_value: string;
}

async function querySegment(
  ch: ClickHouseClient,
  projectId: string,
  eventName: string,
  dateFrom: string,
  dateTo: string,
  filters: PropertyFilter[],
): Promise<{ raw: number; uniq: number }> {
  const node = select(...baseMetricColumns())
    .from('events')
    .where(
      analyticsWhere({
        projectId,
        from: dateFrom,
        to: toChTs(dateTo, true),
        eventName,
        filters,
      }),
    )
    .build();

  const { sql, params } = compile(node);
  const res = await ch.query({ query: sql, query_params: params, format: 'JSONEachRow' });
  const rows = await res.json<RawRow>();
  const row = rows[0] ?? { raw_value: '0', uniq_value: '0' };
  return { raw: Number(row.raw_value), uniq: Number(row.uniq_value) };
}

@Injectable()
export class SegmentCompareTool implements AiTool {
  readonly name = tool.name;
  readonly cacheable = true;

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
  ) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, _userId, projectId) => {
    const {
      event_name: eventName,
      metric,
      date_from: dateFrom,
      date_to: dateTo,
      segment_a_filters: segmentAFilters,
      segment_b_filters: segmentBFilters,
      segment_a_name: segmentAName = 'Segment A',
      segment_b_name: segmentBName = 'Segment B',
    } = args;

    const [segmentA, segmentB] = await Promise.all([
      querySegment(this.ch, projectId, eventName, dateFrom, dateTo, segmentAFilters as PropertyFilter[]),
      querySegment(this.ch, projectId, eventName, dateFrom, dateTo, segmentBFilters as PropertyFilter[]),
    ]);

    const valueA = computeMetricValue(metric, segmentA.raw, segmentA.uniq);
    const valueB = computeMetricValue(metric, segmentB.raw, segmentB.uniq);

    const absoluteDiff = valueB - valueA;
    const relativeDiff = valueA === 0
      ? (valueB === 0 ? 0 : 100)
      : Math.round((absoluteDiff / valueA) * 10000) / 100;

    return {
      event_name: eventName,
      metric,
      date_from: dateFrom,
      date_to: dateTo,
      segment_a: {
        name: segmentAName,
        value: valueA,
        raw_count: segmentA.raw,
        unique_users: segmentA.uniq,
        filters: segmentAFilters,
      },
      segment_b: {
        name: segmentBName,
        value: valueB,
        raw_count: segmentB.raw,
        unique_users: segmentB.uniq,
        filters: segmentBFilters,
      },
      comparison: {
        absolute_diff: absoluteDiff,
        relative_diff_pct: relativeDiff,
        winner: valueA >= valueB ? segmentAName : segmentBName,
      },
    };
  });
}
