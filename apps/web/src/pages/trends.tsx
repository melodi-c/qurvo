import { useState } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { TrendQueryPanel } from '@/features/dashboard/components/widgets/trend/TrendQueryPanel';
import { defaultTrendConfig } from '@/features/dashboard/components/widgets/trend/trend-shared';
import { Metric } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import { METRIC_OPTIONS } from '@/features/dashboard/components/widgets/trend/trend-shared';
import type { TrendWidgetConfig } from '@/api/generated/Api';

export default function TrendsPage() {
  const [config, setConfig] = useState<TrendWidgetConfig>(defaultTrendConfig);

  const isConfigValid =
    config.series.length >= 1 && config.series.every((s) => s.event_name.trim() !== '');

  const { data, isLoading, isFetching } = useTrendData(config, 'trends-page');
  const showSkeleton = isLoading && !data;
  const result = data?.data;
  const series = result?.series;

  // Summary metrics
  const totalValue = series?.reduce(
    (acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0),
    0,
  ) ?? 0;
  const seriesCount = series?.length ?? 0;
  const metricLabel = METRIC_OPTIONS.find((o) => o.value === config.metric)?.label ?? config.metric;

  return (
    <div className="-m-6 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-background px-5 h-14 flex-shrink-0">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Trend</span>
        </div>
        <h1 className="text-base font-semibold">Trends</h1>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel: Query builder */}
        <TrendQueryPanel config={config} onChange={setConfig} />

        {/* Right panel: Visualization */}
        <main className="flex-1 overflow-auto flex flex-col">

          {/* Not configured */}
          {!isConfigValid && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BarChart3 className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Configure your trend</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add at least 1 series with an event name to see results
                </p>
              </div>
            </div>
          )}

          {/* Loading (first load only) */}
          {isConfigValid && showSkeleton && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              <div className="flex gap-8">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              <Skeleton className="h-[300px] w-full" />
            </div>
          )}

          {/* No data */}
          {isConfigValid && !showSkeleton && (!series || series.length === 0) && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <TrendingUp className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No results found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No events match these series in the selected date range
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {isConfigValid && !showSkeleton && series && series.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              {/* Metric strip */}
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label={metricLabel} value={totalValue.toLocaleString()} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Series" value={String(seriesCount)} />
                {result?.compare && result.series_previous && (
                  <>
                    <div className="w-px h-8 bg-border/50 mx-6" />
                    <Metric
                      label="Previous period"
                      value={result.series_previous
                        .reduce((acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0), 0)
                        .toLocaleString()}
                    />
                  </>
                )}
              </div>
              {/* Chart */}
              <div className="flex-1 overflow-auto p-6 pt-8">
                <TrendChart
                  series={series}
                  previousSeries={result?.series_previous}
                  chartType={config.chart_type}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
