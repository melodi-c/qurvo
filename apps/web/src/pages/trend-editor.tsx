import { TrendingUp, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { TrendQueryPanel } from '@/features/dashboard/components/widgets/trend/TrendQueryPanel';
import { defaultTrendConfig, METRIC_OPTIONS } from '@/features/dashboard/components/widgets/trend/trend-shared';
import type { TrendWidgetConfig } from '@/api/generated/Api';

function cleanTrendConfig(config: TrendWidgetConfig): TrendWidgetConfig {
  return {
    ...config,
    series: config.series.map((s) => ({
      ...s,
      filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
    })),
  };
}

export default function TrendEditorPage() {
  const editor = useInsightEditor<TrendWidgetConfig>({
    type: 'trend',
    basePath: '/trends',
    defaultName: 'Untitled trend',
    defaultConfig: defaultTrendConfig,
    cleanConfig: cleanTrendConfig,

  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave } = editor;

  const isConfigValid =
    config.series.length >= 1 && config.series.every((s) => s.event_name.trim() !== '');
  const isValid = name.trim() !== '' && isConfigValid;

  const previewId = editor.isNew ? 'trend-new' : editor.insightId!;
  const { data, isLoading, isFetching } = useTrendData(config, previewId);
  const result = data?.data;
  const series = result?.series;
  const showSkeleton = isLoading && !data;

  const totalValue = series?.reduce(
    (acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0),
    0,
  ) ?? 0;
  const seriesCount = series?.length ?? 0;
  const metricLabel = METRIC_OPTIONS.find((o) => o.value === config.metric)?.label ?? config.metric;

  return (
    <div className="-m-6 h-full flex flex-col overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel="Trends"
        name={name}
        onNameChange={setName}
        placeholder="Untitled trend"
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="flex flex-1 min-h-0">
        <TrendQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {!isConfigValid && (
            <EmptyState
              icon={BarChart3}
              title="Configure your trend"
              description="Add at least 1 series with an event name to see results"
              className="flex-1 p-8 py-0"
            />
          )}

          {isConfigValid && showSkeleton && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              <div className="flex gap-8">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              <Skeleton className="h-[300px] w-full" />
            </div>
          )}

          {isConfigValid && !showSkeleton && (!series || series.length === 0) && (
            <EmptyState
              icon={TrendingUp}
              title="No results found"
              description="No events match these series in the selected date range"
              className="flex-1 p-8 py-0"
            />
          )}

          {isConfigValid && !showSkeleton && series && series.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
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
              <div className="flex-1 overflow-auto p-6 pt-8">
                <TrendChart
                  series={series}
                  previousSeries={result?.series_previous}
                  chartType={config.chart_type}
                  granularity={config.granularity}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
