import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { RetentionChart } from '@/features/dashboard/components/widgets/retention/RetentionChart';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';
import { PathsChart } from '@/features/dashboard/components/widgets/paths/PathsChart';
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

interface TrendToolResult {
  series: TrendSeriesResult[];
  series_previous?: TrendSeriesResult[];
  granularity?: TrendGranularity;
}

interface FunnelToolResult {
  steps: FunnelStepResult[];
  breakdown?: boolean;
  aggregate_steps?: FunnelStepResult[];
}

interface PathsToolResult {
  transitions: PathTransition[];
  top_paths?: TopPath[];
}

type AiToolResultData =
  | { type: 'trend_chart'; data: TrendToolResult }
  | { type: 'funnel_chart'; data: FunnelToolResult }
  | { type: 'retention_chart'; data: RetentionResult }
  | { type: 'lifecycle_chart'; data: LifecycleResult }
  | { type: 'stickiness_chart'; data: StickinessResult }
  | { type: 'paths_chart'; data: PathsToolResult };

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

function parseToolResult(visualizationType: string | null, result: unknown): AiToolResultData | null {
  if (!visualizationType || !result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  switch (visualizationType) {
    case 'trend_chart':
      return isTrendResult(r) ? { type: 'trend_chart', data: r } : null;
    case 'funnel_chart':
      return isFunnelResult(r) ? { type: 'funnel_chart', data: r } : null;
    case 'retention_chart':
      return isRetentionResult(r) ? { type: 'retention_chart', data: r } : null;
    case 'lifecycle_chart':
      return isLifecycleResult(r) ? { type: 'lifecycle_chart', data: r } : null;
    case 'stickiness_chart':
      return isStickinessResult(r) ? { type: 'stickiness_chart', data: r } : null;
    case 'paths_chart':
      return isPathsResult(r) ? { type: 'paths_chart', data: r } : null;
    default:
      return null;
  }
}

/**
 * ClickHouse returns bucket as "2026-02-22 00:00:00" but TrendChart expects
 * "2026-02-22" (day) or "2026-02-22T10" (hour). Normalize the format.
 */
function normalizeTrendSeries(series: TrendSeriesResult[]): TrendSeriesResult[] {
  return series.map((s) => ({
    ...s,
    data: s.data.map((dp) => ({
      ...dp,
      bucket: normalizeBucket(dp.bucket),
    })),
  }));
}

function normalizeBucket(bucket: string): string {
  if (!bucket) return bucket;
  // "2026-02-22 00:00:00" → "2026-02-22"
  const match = bucket.match(/^(\d{4}-\d{2}-\d{2}) 00:00:00$/);
  if (match) return match[1];
  // "2026-02-22 14:00:00" → "2026-02-22T14" (hourly)
  const hourMatch = bucket.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):00:00$/);
  if (hourMatch) return `${hourMatch[1]}T${hourMatch[2]}`;
  return bucket;
}

interface AiToolResultProps {
  toolName: string;
  result: unknown;
  visualizationType: string | null;
}

export function AiToolResult({ result, visualizationType }: AiToolResultProps) {
  const parsed = useMemo(
    () => parseToolResult(visualizationType, result),
    [visualizationType, result],
  );

  if (!parsed) return null;

  return (
    <Card className="my-2">
      <CardContent className="pt-4 pb-3">
        {parsed.type === 'trend_chart' && (
          <TrendChart
            series={normalizeTrendSeries(parsed.data.series)}
            previousSeries={parsed.data.series_previous ? normalizeTrendSeries(parsed.data.series_previous) : undefined}
            chartType="line"
            granularity={parsed.data.granularity}
          />
        )}
        {parsed.type === 'funnel_chart' && (
          <FunnelChart
            steps={parsed.data.steps}
            breakdown={parsed.data.breakdown}
            aggregateSteps={parsed.data.aggregate_steps}
          />
        )}
        {parsed.type === 'retention_chart' && (
          <RetentionChart result={parsed.data} />
        )}
        {parsed.type === 'lifecycle_chart' && (
          <LifecycleChart result={parsed.data} />
        )}
        {parsed.type === 'stickiness_chart' && (
          <StickinessChart result={parsed.data} />
        )}
        {parsed.type === 'paths_chart' && (
          <PathsChart
            transitions={parsed.data.transitions}
            topPaths={parsed.data.top_paths ?? []}
          />
        )}
      </CardContent>
    </Card>
  );
}
