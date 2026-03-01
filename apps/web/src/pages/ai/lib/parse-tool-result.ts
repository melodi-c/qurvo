import {
  rootCauseToolOutputSchema,
  funnelGapToolOutputSchema,
  segmentCompareOutputSchema,
  histogramToolOutputSchema,
} from '@qurvo/ai-types';
import type {
  TrendSeriesResult,
  TrendGranularity,
  FunnelStepResult,
  RetentionResult,
  LifecycleResult,
  StickinessResult,
  PathTransition,
  TopPath,
} from '@/api/generated/Api';
import type {
  AiToolResultData,
  SegmentCompareResult,
  TimeBetweenEventsResult,
  RootCauseResult,
  FunnelGapResult,
} from '../ai-tool-result-export';

export interface TrendToolResult {
  series: TrendSeriesResult[];
  series_previous?: TrendSeriesResult[];
  granularity?: TrendGranularity;
}

export interface FunnelToolResult {
  steps: FunnelStepResult[];
  breakdown?: boolean;
  aggregate_steps?: FunnelStepResult[];
}

export interface PathsToolResult {
  transitions: PathTransition[];
  top_paths?: TopPath[];
}

export interface LinkToolResult {
  link: string;
  name?: string;
  insight_id?: string;
  widget_id?: string;
  dashboard_id?: string;
}

// Type guards

function isTrendResult(r: Record<string, unknown>): r is Record<string, unknown> & TrendToolResult {
  return Array.isArray(r.series);
}

function isFunnelResult(r: Record<string, unknown>): r is Record<string, unknown> & FunnelToolResult {
  return Array.isArray(r.steps);
}

function isRetentionResult(r: Record<string, unknown>): r is Record<string, unknown> & RetentionResult {
  return Array.isArray(r.cohorts);
}

function isLifecycleResult(r: Record<string, unknown>): r is Record<string, unknown> & LifecycleResult {
  return Array.isArray(r.data);
}

function isStickinessResult(r: Record<string, unknown>): r is Record<string, unknown> & StickinessResult {
  return Array.isArray(r.data);
}

function isPathsResult(r: Record<string, unknown>): r is Record<string, unknown> & PathsToolResult {
  return Array.isArray(r.transitions);
}

// Zod parsers

function parseSegmentCompareResult(r: unknown): SegmentCompareResult | null {
  const result = segmentCompareOutputSchema.safeParse(r);
  return result.success ? result.data : null;
}

function parseHistogramResult(r: unknown): TimeBetweenEventsResult | null {
  const result = histogramToolOutputSchema.safeParse(r);
  return result.success ? result.data : null;
}

function parseRootCauseResult(r: unknown): RootCauseResult | null {
  const result = rootCauseToolOutputSchema.safeParse(r);
  return result.success ? result.data : null;
}

function parseFunnelGapResult(r: unknown): FunnelGapResult | null {
  const result = funnelGapToolOutputSchema.safeParse(r);
  return result.success ? result.data : null;
}

// Main parser

export function parseToolResult(visualizationType: string | null, result: unknown): AiToolResultData | null {
  if (!visualizationType || !result || typeof result !== 'object') {return null;}
  const r = result as Record<string, unknown>;

  switch (visualizationType) {
    case 'trend_chart': {
      return isTrendResult(r) ? { type: 'trend_chart', data: r } : null;
    }
    case 'funnel_chart': {
      return isFunnelResult(r) ? { type: 'funnel_chart', data: r } : null;
    }
    case 'retention_chart': {
      return isRetentionResult(r) ? { type: 'retention_chart', data: r } : null;
    }
    case 'lifecycle_chart': {
      return isLifecycleResult(r) ? { type: 'lifecycle_chart', data: r } : null;
    }
    case 'stickiness_chart': {
      return isStickinessResult(r) ? { type: 'stickiness_chart', data: r } : null;
    }
    case 'paths_chart': {
      return isPathsResult(r) ? { type: 'paths_chart', data: r } : null;
    }
    case 'segment_compare_chart': {
      const parsed = parseSegmentCompareResult(r);
      return parsed ? { type: 'segment_compare_chart', data: parsed } : null;
    }
    case 'histogram_chart': {
      const parsed = parseHistogramResult(r);
      return parsed ? { type: 'histogram_chart', data: parsed } : null;
    }
    case 'root_cause_chart': {
      const parsed = parseRootCauseResult(r);
      return parsed ? { type: 'root_cause_chart', data: parsed } : null;
    }
    case 'funnel_gap_chart': {
      const parsed = parseFunnelGapResult(r);
      return parsed ? { type: 'funnel_gap_chart', data: parsed } : null;
    }
    default:
      return null;
  }
}

// Bucket normalization

/**
 * ClickHouse returns bucket as "2026-02-22 00:00:00" but TrendChart expects
 * "2026-02-22" (day) or "2026-02-22T10" (hour). Normalize the format.
 */
export function normalizeTrendSeries(series: TrendSeriesResult[]): TrendSeriesResult[] {
  return series.map((s) => ({
    ...s,
    data: s.data.map((dp) => ({
      ...dp,
      bucket: normalizeBucket(dp.bucket),
    })),
  }));
}

function normalizeBucket(bucket: string): string {
  if (!bucket) {return bucket;}
  // "2026-02-22 00:00:00" -> "2026-02-22"
  const match = bucket.match(/^(\d{4}-\d{2}-\d{2}) 00:00:00$/);
  if (match) {return match[1];}
  // "2026-02-22 14:00:00" -> "2026-02-22T14" (hourly)
  const hourMatch = bucket.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):00:00$/);
  if (hourMatch) {return `${hourMatch[1]}T${hourMatch[2]}`;}
  return bucket;
}

// Link result helpers

export function isLinkResult(result: unknown): result is LinkToolResult {
  return typeof result === 'object' && result !== null && typeof (result as Record<string, unknown>).link === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLinkLabel(toolName: string, result: LinkToolResult, t: (key: any) => string): string {
  if (toolName === 'create_insight') {
    return result.name ? t('openInsightNamed', { name: result.name }) : t('openInsight');
  }
  if (toolName === 'save_to_dashboard') {
    return t('openDashboard');
  }
  return t('openLink');
}
