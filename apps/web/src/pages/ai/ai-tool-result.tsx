import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { RetentionChart } from '@/features/dashboard/components/widgets/retention/RetentionChart';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';
import { PathsChart } from '@/features/dashboard/components/widgets/paths/PathsChart';

interface AiToolResultProps {
  toolName: string;
  result: any;
  visualizationType: string | null;
}

/**
 * ClickHouse returns bucket as "2026-02-22 00:00:00" but TrendChart expects
 * "2026-02-22" (day) or "2026-02-22T10" (hour). Normalize the format.
 */
function normalizeTrendSeries(series: any[]): any[] {
  return series.map((s: any) => ({
    ...s,
    data: s.data.map((dp: any) => ({
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

export function AiToolResult({ result, visualizationType }: AiToolResultProps) {
  if (!result || !visualizationType) return null;

  const normalizedSeries = useMemo(() => {
    if (visualizationType === 'trend_chart' && result.series) {
      return normalizeTrendSeries(result.series);
    }
    return null;
  }, [visualizationType, result]);

  return (
    <Card className="my-2">
      <CardContent className="pt-4 pb-3">
        {visualizationType === 'trend_chart' && normalizedSeries && (
          <TrendChart
            series={normalizedSeries}
            previousSeries={result.series_previous ? normalizeTrendSeries(result.series_previous) : undefined}
            chartType="line"
            granularity={result.granularity}
          />
        )}
        {visualizationType === 'funnel_chart' && result.steps && (
          <FunnelChart
            steps={result.steps}
            breakdown={result.breakdown}
            aggregateSteps={result.aggregate_steps}
          />
        )}
        {visualizationType === 'retention_chart' && result.cohorts && (
          <RetentionChart result={result} />
        )}
        {visualizationType === 'lifecycle_chart' && result.data && (
          <LifecycleChart result={result} />
        )}
        {visualizationType === 'stickiness_chart' && result.data && (
          <StickinessChart result={result} />
        )}
        {visualizationType === 'paths_chart' && result.transitions && (
          <PathsChart
            transitions={result.transitions}
            topPaths={result.top_paths ?? []}
          />
        )}
      </CardContent>
    </Card>
  );
}
