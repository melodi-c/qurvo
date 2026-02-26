import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import { toChTs, RESOLVED_PERSON } from '../../utils/clickhouse-helpers';
import { resolvePropertyExpr } from '../../utils/property-filter';
import { type Metric, computeMetricValue } from './metric.utils';
import { MAX_METRIC_SEGMENTS } from '../../constants';
import type { RootCauseToolOutput } from '@qurvo/ai-types';

const argsSchema = z.object({
  event_name: z.string().describe('The event to analyze (e.g. "purchase", "signup")'),
  metric: z.enum(['unique_users', 'total_events', 'events_per_user']).describe(
    'Aggregation metric: unique_users (distinct person count), total_events (raw count), events_per_user (ratio)',
  ),
  baseline_from: z.string().describe('Baseline period start date in YYYY-MM-DD format'),
  baseline_to: z.string().describe('Baseline period end date in YYYY-MM-DD format'),
  current_from: z.string().describe('Current period start date in YYYY-MM-DD format'),
  current_to: z.string().describe('Current period end date in YYYY-MM-DD format'),
  breakdown_properties: z.array(z.string()).min(1).max(10).describe(
    'Dimension properties to break down by. Use "properties.<key>" for event properties, ' +
    '"user_properties.<key>" for user properties, or direct columns like "country", "device_type", "browser". ' +
    'Example: ["properties.platform", "properties.country", "user_properties.plan"]',
  ),
});

const tool = defineTool({
  name: 'analyze_metric_change',
  description:
    'Root cause analysis — explains WHY a metric changed between two time periods. ' +
    'For each breakdown dimension, computes per-segment relative change and contribution to the overall change. ' +
    'Returns a ranked list of segments driving the metric movement (positive or negative). ' +
    'Use when the user asks "why did X change?", "what caused the drop/spike in Y?", or "what is driving the change in Z?".',
  schema: argsSchema,
  visualizationType: 'root_cause_chart',
});

interface SegmentMetrics {
  baseline_value: number;
  current_value: number;
  relative_change_pct: number;
  absolute_change: number;
  contribution_pct: number;
}

interface SegmentResult extends SegmentMetrics {
  dimension: string;
  segment_value: string;
}

interface DimensionResult {
  dimension: string;
  segments: SegmentResult[];
}

interface RawSegmentRow {
  segment_value: string;
  baseline_raw: string;
  baseline_uniq: string;
  current_raw: string;
  current_uniq: string;
  total_baseline_raw: string;
  total_baseline_uniq: string;
  total_current_raw: string;
  total_current_uniq: string;
}

function computeSegmentMetrics(
  metric: Metric,
  baselineRaw: number,
  baselineUniq: number,
  currentRaw: number,
  currentUniq: number,
  totalBaselineValue: number,
  totalCurrentValue: number,
): SegmentMetrics {
  const baselineValue = computeMetricValue(metric, baselineRaw, baselineUniq);
  const currentValue = computeMetricValue(metric, currentRaw, currentUniq);
  const absoluteChange = currentValue - baselineValue;

  const relativeChange =
    baselineValue === 0
      ? currentValue === 0 ? 0 : 1
      : absoluteChange / baselineValue;

  // Contribution: how much did this segment's absolute change contribute to the total absolute change?
  const totalChange = totalCurrentValue - totalBaselineValue;
  const contribution = totalChange === 0 ? 0 : absoluteChange / totalChange;

  return {
    baseline_value: baselineValue,
    current_value: currentValue,
    relative_change_pct: Math.round(relativeChange * 10000) / 100, // percentage, 2dp
    absolute_change: absoluteChange,
    contribution_pct: Math.round(contribution * 10000) / 100, // percentage, 2dp
  };
}

async function queryDimension(
  ch: ClickHouseClient,
  projectId: string,
  eventName: string,
  metric: Metric,
  baselineFrom: string,
  baselineTo: string,
  currentFrom: string,
  currentTo: string,
  dimension: string,
): Promise<DimensionResult> {
  const breakdownExpr = resolvePropertyExpr(dimension);

  const queryParams: Record<string, unknown> = {
    project_id: projectId,
    event_name: eventName,
    baseline_from: toChTs(baselineFrom),
    baseline_to: toChTs(baselineTo, true),
    current_from: toChTs(currentFrom),
    current_to: toChTs(currentTo, true),
  };

  const sql = `
    WITH
      baseline AS (
        SELECT
          ${breakdownExpr} AS segment_value,
          count() AS raw_value,
          uniqExact(${RESOLVED_PERSON}) AS uniq_value
        FROM events
        WHERE
          project_id = {project_id:UUID}
          AND event_name = {event_name:String}
          AND timestamp >= {baseline_from:DateTime64(3)}
          AND timestamp <= {baseline_to:DateTime64(3)}
        GROUP BY segment_value
      ),
      current_period AS (
        SELECT
          ${breakdownExpr} AS segment_value,
          count() AS raw_value,
          uniqExact(${RESOLVED_PERSON}) AS uniq_value
        FROM events
        WHERE
          project_id = {project_id:UUID}
          AND event_name = {event_name:String}
          AND timestamp >= {current_from:DateTime64(3)}
          AND timestamp <= {current_to:DateTime64(3)}
        GROUP BY segment_value
      ),
      totals AS (
        SELECT
          sum(b.raw_value) AS total_baseline_raw,
          sum(b.uniq_value) AS total_baseline_uniq,
          sum(c.raw_value) AS total_current_raw,
          sum(c.uniq_value) AS total_current_uniq
        FROM
          (SELECT sum(raw_value) AS raw_value, sum(uniq_value) AS uniq_value FROM baseline) AS b,
          (SELECT sum(raw_value) AS raw_value, sum(uniq_value) AS uniq_value FROM current_period) AS c
      )
    SELECT
      coalesce(b.segment_value, c.segment_value) AS segment_value,
      coalesce(b.raw_value, 0) AS baseline_raw,
      coalesce(b.uniq_value, 0) AS baseline_uniq,
      coalesce(c.raw_value, 0) AS current_raw,
      coalesce(c.uniq_value, 0) AS current_uniq,
      (SELECT total_baseline_raw FROM totals) AS total_baseline_raw,
      (SELECT total_baseline_uniq FROM totals) AS total_baseline_uniq,
      (SELECT total_current_raw FROM totals) AS total_current_raw,
      (SELECT total_current_uniq FROM totals) AS total_current_uniq
    FROM baseline AS b
    FULL OUTER JOIN current_period AS c USING (segment_value)
    ORDER BY abs(coalesce(c.raw_value, 0) - coalesce(b.raw_value, 0)) DESC
    LIMIT ${MAX_METRIC_SEGMENTS}
  `;

  const res = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await res.json<RawSegmentRow>();

  const segments: SegmentResult[] = rows.map((row) => {
    const baselineRaw = Number(row.baseline_raw);
    const baselineUniq = Number(row.baseline_uniq);
    const currentRaw = Number(row.current_raw);
    const currentUniq = Number(row.current_uniq);
    const totalBaselineValue = computeMetricValue(metric, Number(row.total_baseline_raw), Number(row.total_baseline_uniq));
    const totalCurrentValue = computeMetricValue(metric, Number(row.total_current_raw), Number(row.total_current_uniq));

    const metrics = computeSegmentMetrics(
      metric,
      baselineRaw,
      baselineUniq,
      currentRaw,
      currentUniq,
      totalBaselineValue,
      totalCurrentValue,
    );

    return {
      dimension,
      segment_value: row.segment_value || '(none)',
      ...metrics,
    };
  });

  // Sort by absolute contribution descending (largest movers first)
  segments.sort((a, b) => Math.abs(b.contribution_pct) - Math.abs(a.contribution_pct));

  return { dimension, segments };
}

async function queryOverallTotals(
  ch: ClickHouseClient,
  projectId: string,
  eventName: string,
  metric: Metric,
  baselineFrom: string,
  baselineTo: string,
  currentFrom: string,
  currentTo: string,
): Promise<{ baseline_value: number; current_value: number; relative_change_pct: number; absolute_change: number }> {
  const queryParams: Record<string, unknown> = {
    project_id: projectId,
    event_name: eventName,
    baseline_from: toChTs(baselineFrom),
    baseline_to: toChTs(baselineTo, true),
    current_from: toChTs(currentFrom),
    current_to: toChTs(currentTo, true),
  };

  const sql = `
    SELECT
      countIf(timestamp >= {baseline_from:DateTime64(3)} AND timestamp <= {baseline_to:DateTime64(3)}) AS baseline_raw,
      uniqExactIf(${RESOLVED_PERSON}, timestamp >= {baseline_from:DateTime64(3)} AND timestamp <= {baseline_to:DateTime64(3)}) AS baseline_uniq,
      countIf(timestamp >= {current_from:DateTime64(3)} AND timestamp <= {current_to:DateTime64(3)}) AS current_raw,
      uniqExactIf(${RESOLVED_PERSON}, timestamp >= {current_from:DateTime64(3)} AND timestamp <= {current_to:DateTime64(3)}) AS current_uniq
    FROM events
    WHERE
      project_id = {project_id:UUID}
      AND event_name = {event_name:String}
      AND (
        (timestamp >= {baseline_from:DateTime64(3)} AND timestamp <= {baseline_to:DateTime64(3)})
        OR (timestamp >= {current_from:DateTime64(3)} AND timestamp <= {current_to:DateTime64(3)})
      )
  `;

  const res = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await res.json<{ baseline_raw: string; baseline_uniq: string; current_raw: string; current_uniq: string }>();
  const row = rows[0] ?? { baseline_raw: '0', baseline_uniq: '0', current_raw: '0', current_uniq: '0' };

  const baselineValue = computeMetricValue(metric, Number(row.baseline_raw), Number(row.baseline_uniq));
  const currentValue = computeMetricValue(metric, Number(row.current_raw), Number(row.current_uniq));
  const absoluteChange = currentValue - baselineValue;
  const relativeChange =
    baselineValue === 0
      ? currentValue === 0 ? 0 : 100
      : Math.round((absoluteChange / baselineValue) * 10000) / 100;

  return { baseline_value: baselineValue, current_value: currentValue, relative_change_pct: relativeChange, absolute_change: absoluteChange };
}

@Injectable()
export class MetricChangeTool implements AiTool {
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
      baseline_from: baselineFrom,
      baseline_to: baselineTo,
      current_from: currentFrom,
      current_to: currentTo,
      breakdown_properties: breakdownProperties,
    } = args;

    // Run overall totals + all dimension breakdowns in parallel
    const [overall, ...dimensionResults] = await Promise.all([
      queryOverallTotals(this.ch, projectId, eventName, metric, baselineFrom, baselineTo, currentFrom, currentTo),
      ...breakdownProperties.map((dim) =>
        queryDimension(this.ch, projectId, eventName, metric, baselineFrom, baselineTo, currentFrom, currentTo, dim),
      ),
    ]);

    // Build a flat ranked list across all dimensions, sorted by absolute contribution
    const allSegments: SegmentResult[] = dimensionResults.flatMap((d) => d.segments);
    allSegments.sort((a, b) => Math.abs(b.contribution_pct) - Math.abs(a.contribution_pct));

    return {
      event_name: eventName,
      metric,
      periods: {
        baseline: { from: baselineFrom, to: baselineTo },
        current: { from: currentFrom, to: currentTo },
      },
      overall: {
        metric: eventName,
        absolute_change: overall.absolute_change,
        relative_change_pct: overall.relative_change_pct,
      },
      dimensions: dimensionResults,
      top_segments: allSegments.slice(0, 20).map((s) => ({
        dimension: s.dimension,
        segment_value: s.segment_value,
        relative_change_pct: s.relative_change_pct,
        contribution_pct: s.contribution_pct,
        absolute_change: s.absolute_change,
        baseline_value: s.baseline_value,
        current_value: s.current_value,
      })),
    } satisfies RootCauseToolOutput;
  });
}
