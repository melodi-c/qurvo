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

interface RetentionToolResult extends RetentionResult {}

interface LifecycleToolResult extends LifecycleResult {}

interface StickinessToolResult extends StickinessResult {}

interface PathsToolResult {
  transitions: PathTransition[];
  top_paths?: TopPath[];
}

type AiToolResultData =
  | { type: 'trend_chart'; data: TrendToolResult }
  | { type: 'funnel_chart'; data: FunnelToolResult }
  | { type: 'retention_chart'; data: RetentionToolResult }
  | { type: 'lifecycle_chart'; data: LifecycleToolResult }
  | { type: 'stickiness_chart'; data: StickinessToolResult }
  | { type: 'paths_chart'; data: PathsToolResult };

function parseToolResult(visualizationType: string | null, result: unknown): AiToolResultData | null {
  if (!visualizationType || !result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  switch (visualizationType) {
    case 'trend_chart':
      if (Array.isArray(r.series)) return { type: 'trend_chart', data: r as unknown as TrendToolResult };
      return null;
    case 'funnel_chart':
      if (Array.isArray(r.steps)) return { type: 'funnel_chart', data: r as unknown as FunnelToolResult };
      return null;
    case 'retention_chart':
      if (Array.isArray((r as Record<string, unknown>).cohorts)) return { type: 'retention_chart', data: r as unknown as RetentionToolResult };
      return null;
    case 'lifecycle_chart':
      if (Array.isArray(r.data)) return { type: 'lifecycle_chart', data: r as unknown as LifecycleToolResult };
      return null;
    case 'stickiness_chart':
      if (Array.isArray(r.data)) return { type: 'stickiness_chart', data: r as unknown as StickinessToolResult };
      return null;
    case 'paths_chart':
      if (Array.isArray(r.transitions)) return { type: 'paths_chart', data: r as unknown as PathsToolResult };
      return null;
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
