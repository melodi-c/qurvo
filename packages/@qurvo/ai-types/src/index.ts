import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas reused by multiple tools
// ---------------------------------------------------------------------------

const trendDataPointSchema = z.object({
  bucket: z.string(),
  value: z.number(),
});

const trendSeriesResultSchema = z.object({
  series_idx: z.number(),
  label: z.string(),
  event_name: z.string(),
  data: z.array(trendDataPointSchema),
  breakdown_value: z.string().optional(),
});

const funnelStepResultSchema = z.object({
  step: z.number(),
  label: z.string(),
  event_name: z.string(),
  count: z.number(),
  conversion_rate: z.number(),
  drop_off: z.number(),
  drop_off_rate: z.number(),
  avg_time_to_convert_seconds: z.number().nullable(),
});

// ---------------------------------------------------------------------------
// trend_chart
// ---------------------------------------------------------------------------

export const trendToolOutputSchema = z.object({
  series: z.array(trendSeriesResultSchema),
  series_previous: z.array(trendSeriesResultSchema).optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional(),
});

export type TrendToolOutput = z.infer<typeof trendToolOutputSchema>;

// ---------------------------------------------------------------------------
// funnel_chart
// ---------------------------------------------------------------------------

const funnelBreakdownStepResultSchema = funnelStepResultSchema.extend({
  breakdown_value: z.string(),
});

export const funnelToolOutputSchema = z.object({
  steps: z.array(z.union([funnelStepResultSchema, funnelBreakdownStepResultSchema])),
  breakdown: z.boolean().optional(),
  aggregate_steps: z.array(funnelStepResultSchema).optional(),
});

export type FunnelToolOutput = z.infer<typeof funnelToolOutputSchema>;

// ---------------------------------------------------------------------------
// segment_compare_chart
// ---------------------------------------------------------------------------

const segmentCompareSegmentSchema = z.object({
  name: z.string(),
  value: z.number(),
  raw_count: z.number(),
  unique_users: z.number(),
});

export const segmentCompareOutputSchema = z.object({
  event_name: z.string(),
  metric: z.enum(['unique_users', 'total_events', 'events_per_user']),
  date_from: z.string(),
  date_to: z.string(),
  segment_a: segmentCompareSegmentSchema,
  segment_b: segmentCompareSegmentSchema,
  comparison: z.object({
    absolute_diff: z.number(),
    relative_diff_pct: z.number(),
    winner: z.string(),
  }),
});

export type SegmentCompareOutput = z.infer<typeof segmentCompareOutputSchema>;

// ---------------------------------------------------------------------------
// histogram_chart
// ---------------------------------------------------------------------------

const histogramBucketSchema = z.object({
  label: z.string(),
  from_seconds: z.number(),
  to_seconds: z.number(),
  count: z.number(),
});

export const histogramToolOutputSchema = z.object({
  event_a: z.string(),
  event_b: z.string(),
  date_from: z.string(),
  date_to: z.string(),
  total_users: z.number(),
  buckets: z.array(histogramBucketSchema),
  stats: z.object({
    mean_seconds: z.number(),
    median_seconds: z.number(),
    p75_seconds: z.number(),
    p90_seconds: z.number(),
    min_seconds: z.number(),
    max_seconds: z.number(),
  }),
});

export type HistogramToolOutput = z.infer<typeof histogramToolOutputSchema>;

// ---------------------------------------------------------------------------
// root_cause_chart
// ---------------------------------------------------------------------------

export const rootCauseSegmentSchema = z.object({
  dimension: z.string(),
  segment_value: z.string(),
  relative_change_pct: z.number(),
  contribution_pct: z.number(),
  absolute_change: z.number(),
  baseline_value: z.number(),
  current_value: z.number(),
});

export const rootCauseOverallSchema = z.object({
  metric: z.string(),
  absolute_change: z.number(),
  relative_change_pct: z.number(),
});

const rootCauseDimensionResultSchema = z.object({
  dimension: z.string(),
  segments: z.array(rootCauseSegmentSchema),
});

export const rootCauseToolOutputSchema = z.object({
  event_name: z.string().optional(),
  metric: z.string().optional(),
  periods: z.object({
    baseline: z.object({ from: z.string(), to: z.string() }),
    current: z.object({ from: z.string(), to: z.string() }),
  }).optional(),
  overall: rootCauseOverallSchema,
  dimensions: z.array(rootCauseDimensionResultSchema).optional(),
  top_segments: z.array(rootCauseSegmentSchema),
});

export type RootCauseToolOutput = z.infer<typeof rootCauseToolOutputSchema>;
export type RootCauseSegment = z.infer<typeof rootCauseSegmentSchema>;
export type RootCauseOverall = z.infer<typeof rootCauseOverallSchema>;

// ---------------------------------------------------------------------------
// funnel_gap_chart
// ---------------------------------------------------------------------------

export const funnelGapItemSchema = z.object({
  event_name: z.string(),
  relative_lift_pct: z.number(),
  users_with_event: z.number(),
  users_without_event: z.number(),
});

export const funnelGapToolOutputSchema = z.object({
  funnel_step_from: z.string(),
  funnel_step_to: z.string(),
  items: z.array(funnelGapItemSchema),
});

export type FunnelGapToolOutput = z.infer<typeof funnelGapToolOutputSchema>;
export type FunnelGapItem = z.infer<typeof funnelGapItemSchema>;
