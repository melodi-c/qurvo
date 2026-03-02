import { useMemo, useCallback, useState } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { EditorSkeleton } from '@/components/ui/editor-skeleton';
import { InsightEditorLayout } from '@/components/InsightEditorLayout';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useTrendData, cleanSeries } from '@/features/dashboard/hooks/use-trend';
import { useTrendAggregateData } from '@/features/dashboard/hooks/use-trend-aggregate';
import { useAnnotations, useCreateAnnotation, useUpdateAnnotation, useDeleteAnnotation } from '@/features/dashboard/hooks/use-annotations';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { TrendQueryPanel } from '@/features/dashboard/components/widgets/trend/TrendQueryPanel';
import { defaultTrendConfig, CUSTOM_QUERY_CHART_TYPES } from '@/features/dashboard/components/widgets/trend/trend-shared';
import { AnnotationDialog } from '@/components/ui/annotation-dialog';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './trend-editor.translations';
import { trendToCsv, downloadCsv } from '@/lib/csv-export';
import type { TrendWidgetConfig, Annotation } from '@/api/generated/Api';

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

  const { name, setName, description, setDescription, config, setConfig, isSaving, saveError, listPath, handleSave,
    previewId, isConfigValid, isValid, showSkeleton, unsavedGuard } = editor;

  const isCustomQuery = CUSTOM_QUERY_CHART_TYPES.includes(config.chart_type);

  // Both hooks always called (React rules); only the relevant one fires.
  const trendQuery = useTrendData(
    isCustomQuery ? { ...config, chart_type: 'line', series: [] } : config,
    previewId,
  );
  const aggregateQuery = useTrendAggregateData(
    isCustomQuery ? config : { ...config, series: [] },
    previewId,
  );

  const { data, isLoading, isFetching } = isCustomQuery ? aggregateQuery : trendQuery;
  const trendResult = trendQuery.data?.data;
  const aggregateResult = aggregateQuery.data?.data;
  const series = trendResult?.series;

  const { data: annotations } = useAnnotations(config.date_from, config.date_to);
  const createAnnotation = useCreateAnnotation();
  const updateAnnotation = useUpdateAnnotation();
  const deleteAnnotation = useDeleteAnnotation();
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [annotationInitialDate, setAnnotationInitialDate] = useState<string | undefined>(undefined);

  const totalValue = series?.reduce(
    (acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0),
    0,
  ) ?? 0;
  const seriesCount = series?.length ?? 0;
  const handleExportCsv = useCallback(() => {
    if (!series) {return;}
    downloadCsv(trendToCsv(series), 'trend.csv');
  }, [series]);

  const handleToggleSeries = useCallback((seriesIdx: number) => {
    setConfig((prev) => ({
      ...prev,
      series: prev.series.map((s, i) =>
        i === seriesIdx ? { ...s, hidden: !s.hidden } : s,
      ),
    }));
  }, [setConfig]);

  const handleEditAnnotation = useCallback((ann: Annotation) => {
    setEditingAnnotation(ann);
    setAnnotationInitialDate(undefined);
    setAnnotationDialogOpen(true);
  }, []);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    await deleteAnnotation.mutateAsync(id);
  }, [deleteAnnotation]);

  const handleCreateAnnotationFromOverlay = useCallback((date: string) => {
    setEditingAnnotation(null);
    setAnnotationInitialDate(date);
    setAnnotationDialogOpen(true);
  }, []);

  const handleAnnotationSave = useCallback(async (data: { date: string; label: string; description?: string; color?: string }) => {
    if (editingAnnotation) {
      await updateAnnotation.mutateAsync({ id: editingAnnotation.id, data });
    } else {
      await createAnnotation.mutateAsync(data);
    }
  }, [editingAnnotation, updateAnnotation, createAnnotation]);

  const METRIC_LABELS: Record<string, string> = useMemo(() => ({
    total_events: t('totalEvents'),
    unique_users: t('uniqueUsers'),
    events_per_user: t('eventsPerUser'),
    first_time_users: t('firstTimeUsers'),
    first_matching_event: t('firstMatchingEvent'),
    property_sum: t('propertySum'),
    property_avg: t('propertyAvg'),
    property_min: t('propertyMin'),
    property_max: t('propertyMax'),
  }), [t]);

  // Show the common metric label if all series share the same metric, otherwise "Total"
  const metricLabel = useMemo(() => {
    const metrics = new Set(config.series.map((s) => s.metric));
    if (metrics.size === 1) {
      const m = config.series[0].metric;
      return METRIC_LABELS[m] ?? m;
    }
    return t('totalValue');
  }, [config.series, METRIC_LABELS, t]);

  return (
    <InsightEditorLayout
      backPath={listPath}
      backLabel={t('backLabel')}
      name={name}
      onNameChange={setName}
      placeholder={t('placeholder')}
      description={description}
      onDescriptionChange={setDescription}
      descriptionPlaceholder={t('descriptionPlaceholder')}
      onSave={handleSave}
      isSaving={isSaving}
      isValid={isValid}
      saveError={saveError}
      queryPanel={<TrendQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={isConfigValid}
      showSkeleton={showSkeleton(isLoading, data)}
      isEmpty={isCustomQuery
        ? !aggregateResult || (!aggregateResult.heatmap?.length && !aggregateResult.world_map?.length)
        : !series || series.length === 0}
      isFetching={isFetching}
      configureIcon={BarChart3}
      configureTitle={t('configureTitle')}
      configureDescription={t('configureDescription')}
      noResultsIcon={TrendingUp}
      noResultsTitle={t('noResultsTitle')}
      noResultsDescription={t('noResultsDescription')}
      skeleton={<EditorSkeleton metricCount={2} />}
      metricsBar={!isCustomQuery ? (
        <>
          <Metric label={metricLabel} value={totalValue.toLocaleString()} accent />
          <MetricsDivider />
          <Metric label={t('series')} value={String(seriesCount)} />
          {trendResult?.compare && trendResult.series_previous && (
            <>
              <MetricsDivider />
              <Metric
                label={t('previousPeriod')}
                value={trendResult.series_previous
                  .reduce((acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0), 0)
                  .toLocaleString()}
              />
            </>
          )}
        </>
      ) : undefined}
      onExportCsv={series ? handleExportCsv : undefined}
      chartClassName="flex-1 overflow-auto p-6 pt-8"
      unsavedGuard={unsavedGuard}
    >
      <TrendChart
        series={series ?? []}
        previousSeries={trendResult?.series_previous}
        chartType={config.chart_type}
        granularity={config.granularity}
        formulas={config.formulas}
        annotations={annotations}
        seriesConfig={config.series}
        onToggleSeries={handleToggleSeries}
        onEditAnnotation={handleEditAnnotation}
        onDeleteAnnotation={handleDeleteAnnotation}
        onCreateAnnotation={handleCreateAnnotationFromOverlay}
        heatmapData={aggregateResult?.heatmap}
      />
      <AnnotationDialog
        open={annotationDialogOpen}
        onOpenChange={(open) => {
          setAnnotationDialogOpen(open);
          if (!open) {setEditingAnnotation(null);}
        }}
        initialDate={annotationInitialDate ?? config.date_to ?? undefined}
        annotation={editingAnnotation ?? undefined}
        onSave={handleAnnotationSave}
      />
    </InsightEditorLayout>
  );
}
