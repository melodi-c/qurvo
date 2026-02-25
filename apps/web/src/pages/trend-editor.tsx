import { useMemo } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { EditorSkeleton } from '@/components/ui/editor-skeleton';
import { InsightEditorLayout } from '@/components/InsightEditorLayout';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useTrendData, cleanSeries } from '@/features/dashboard/hooks/use-trend';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { TrendQueryPanel } from '@/features/dashboard/components/widgets/trend/TrendQueryPanel';
import { defaultTrendConfig } from '@/features/dashboard/components/widgets/trend/trend-shared';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './trend-editor.translations';
import type { TrendWidgetConfig } from '@/api/generated/Api';

function cleanTrendConfig(config: TrendWidgetConfig): TrendWidgetConfig {
  return { ...config, series: cleanSeries(config) };
}

export default function TrendEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<TrendWidgetConfig>({
    type: 'trend',
    defaultName: t('defaultName'),
    defaultConfig: () => defaultTrendConfig(t('seriesLabel')),
    cleanConfig: cleanTrendConfig,
    isConfigValid: (cfg) =>
      cfg.series.length >= 1 && cfg.series.every((s) => s.event_name.trim() !== ''),
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave,
    previewId, isConfigValid, isValid, showSkeleton } = editor;

  const { data, isLoading, isFetching } = useTrendData(config, previewId);
  const result = data?.data;
  const series = result?.series;

  const totalValue = series?.reduce(
    (acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0),
    0,
  ) ?? 0;
  const seriesCount = series?.length ?? 0;
  const METRIC_LABELS: Record<string, string> = useMemo(() => ({
    total_events: t('totalEvents'),
    unique_users: t('uniqueUsers'),
    events_per_user: t('eventsPerUser'),
    property_sum: t('propertySum'),
    property_avg: t('propertyAvg'),
    property_min: t('propertyMin'),
    property_max: t('propertyMax'),
  }), [t]);
  const metricLabel = METRIC_LABELS[config.metric] ?? config.metric;

  return (
    <InsightEditorLayout
      backPath={listPath}
      backLabel={t('backLabel')}
      name={name}
      onNameChange={setName}
      placeholder={t('placeholder')}
      onSave={handleSave}
      isSaving={isSaving}
      isValid={isValid}
      saveError={saveError}
      queryPanel={<TrendQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={isConfigValid}
      showSkeleton={showSkeleton(isLoading, data)}
      isEmpty={!series || series.length === 0}
      isFetching={isFetching}
      configureIcon={BarChart3}
      configureTitle={t('configureTitle')}
      configureDescription={t('configureDescription')}
      noResultsIcon={TrendingUp}
      noResultsTitle={t('noResultsTitle')}
      noResultsDescription={t('noResultsDescription')}
      skeleton={<EditorSkeleton metricCount={2} />}
      metricsBar={
        <>
          <Metric label={metricLabel} value={totalValue.toLocaleString()} accent />
          <MetricsDivider />
          <Metric label={t('series')} value={String(seriesCount)} />
          {result?.compare && result.series_previous && (
            <>
              <MetricsDivider />
              <Metric
                label={t('previousPeriod')}
                value={result.series_previous
                  .reduce((acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0), 0)
                  .toLocaleString()}
              />
            </>
          )}
        </>
      }
      chartClassName="flex-1 overflow-auto p-6 pt-8"
    >
      <TrendChart
        series={series!}
        previousSeries={result?.series_previous}
        chartType={config.chart_type}
        granularity={config.granularity}
        formulas={config.formulas}
      />
    </InsightEditorLayout>
  );
}
