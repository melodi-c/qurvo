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
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './trend-editor.translations';
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
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<TrendWidgetConfig>({
    type: 'trend',
    defaultName: t('defaultName'),
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
    <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel={t('backLabel')}
        name={name}
        onNameChange={setName}
        placeholder={t('placeholder')}
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        <TrendQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {!isConfigValid && (
            <EmptyState
              icon={BarChart3}
              title={t('configureTitle')}
              description={t('configureDescription')}
              className="flex-1"
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
              title={t('noResultsTitle')}
              description={t('noResultsDescription')}
              className="flex-1"
            />
          )}

          {isConfigValid && !showSkeleton && series && series.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label={metricLabel} value={totalValue.toLocaleString()} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label={t('series')} value={String(seriesCount)} />
                {result?.compare && result.series_previous && (
                  <>
                    <div className="w-px h-8 bg-border/50 mx-6" />
                    <Metric
                      label={t('previousPeriod')}
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
                  formulas={config.formulas}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
