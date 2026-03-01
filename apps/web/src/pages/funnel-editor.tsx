import { useState, useMemo, useCallback } from 'react';
import { GitFork, TrendingDown, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { InsightEditorLayout } from '@/components/InsightEditorLayout';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useFunnelData, cleanSteps } from '@/features/dashboard/hooks/use-funnel';
import { useFunnelTimeToConvertData } from '@/features/dashboard/hooks/use-funnel-time-to-convert';
import type { TimeToConvertConfig } from '@/features/dashboard/hooks/use-funnel-time-to-convert';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { TimeToConvertChart } from '@/features/dashboard/components/widgets/funnel/TimeToConvertChart';
import { TimeToConvertStepSelector } from '@/features/dashboard/components/widgets/funnel/TimeToConvertStepSelector';
import { FunnelQueryPanel } from '@/features/dashboard/components/widgets/funnel/FunnelQueryPanel';
import { getFunnelMetrics } from '@/features/dashboard/components/widgets/funnel/funnel-utils';
import { defaultFunnelConfig } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import { formatSeconds } from '@/lib/formatting';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useTimeToConvertState } from '@/hooks/use-time-to-convert-state';
import { STATUS_COLORS } from '@/lib/chart-colors';
import translations from './funnel-editor.translations';
import { funnelToCsv, downloadCsv } from '@/lib/csv-export';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

type ViewMode = 'conversion' | 'time_to_convert';

function cleanFunnelConfig(config: FunnelWidgetConfig): FunnelWidgetConfig {
  return { ...config, steps: cleanSteps(config) };
}

export default function FunnelEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<FunnelWidgetConfig>({
    type: 'funnel',
    defaultName: t('defaultName'),
    defaultConfig: () => defaultFunnelConfig(t('step1Label'), t('step2Label')),
    cleanConfig: cleanFunnelConfig,
    isConfigValid: (cfg) =>
      cfg.steps.length >= 2 && cfg.steps.every((s) => s.event_name.trim() !== ''),
  });

  const { name, setName, description, setDescription, config, setConfig, isSaving, saveError, listPath, handleSave,
    previewId, isConfigValid, isValid, showSkeleton, unsavedGuard } = editor;

  const [viewMode, setViewMode] = useState<ViewMode>('conversion');
  const { fromStep, setFromStep, toStep, setToStep } = useTimeToConvertState(config.steps.length);

  const viewModeOptions = useMemo(
    () =>
      [
        { label: t('viewConversion'), value: 'conversion' as const },
        { label: t('viewTimeToConvert'), value: 'time_to_convert' as const },
      ] as const,
    [t],
  );

  const { data, isLoading, isFetching } = useFunnelData(config, previewId);
  const funnelResult = data?.data;
  const steps = funnelResult?.steps;
  const breakdown = funnelResult?.breakdown;
  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(funnelResult);

  const ttcConfig: TimeToConvertConfig = useMemo(
    () => ({ ...config, from_step: fromStep, to_step: toStep }),
    [config, fromStep, toStep],
  );
  const ttcPreviewId = `${previewId}-ttc`;
  const {
    data: ttcData,
    isLoading: ttcIsLoading,
    isFetching: ttcIsFetching,
  } = useFunnelTimeToConvertData(ttcConfig, ttcPreviewId);
  const ttcResult = ttcData?.data;

  const handleExportCsv = useCallback(() => {
    if (!steps) {return;}
    downloadCsv(funnelToCsv(steps), 'funnel.csv');
  }, [steps]);

  const isTimeToConvert = viewMode === 'time_to_convert';
  const activeIsLoading = isTimeToConvert ? ttcIsLoading : isLoading;
  const activeIsFetching = isTimeToConvert ? ttcIsFetching : isFetching;
  const activeShowSkeleton = showSkeleton(activeIsLoading, isTimeToConvert ? ttcData : data);
  // For TTC view, never treat empty data as "no results" — TimeToConvertChart
  // renders its own EmptyState so the step selectors (from/to step) remain
  // visible and interactive even when the query returns no data.
  const activeIsEmpty = isTimeToConvert ? false : !steps || steps.length === 0;

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
      queryPanel={<FunnelQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={isConfigValid}
      showSkeleton={activeShowSkeleton}
      isEmpty={activeIsEmpty}
      isFetching={activeIsFetching}
      configureIcon={TrendingDown}
      configureTitle={t('configureTitle')}
      configureDescription={t('configureDescription')}
      noResultsIcon={GitFork}
      noResultsTitle={t('noResultsTitle')}
      noResultsDescription={t('noResultsDescription')}
      skeleton={
        <>
          <div className="flex gap-8">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
          </div>
          <div className="space-y-3 max-w-2xl">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-[75%]" />
            <Skeleton className="h-10 w-[55%]" />
            <Skeleton className="h-10 w-[35%]" />
          </div>
        </>
      }
      metricsBar={
        <>
          {isTimeToConvert ? (
            <>
              <Metric
                label={t('avgTime')}
                value={formatSeconds(ttcResult?.average_seconds) ?? t('noData')}
                accent
              />
              <MetricsDivider />
              <Metric
                label={t('medianTime')}
                value={formatSeconds(ttcResult?.median_seconds) ?? t('noData')}
              />
              <MetricsDivider />
              <Metric
                label={t('sampleSize')}
                value={ttcResult?.sample_size.toLocaleString() ?? t('noData')}
              />
            </>
          ) : (
            <>
              <Metric label={t('overallConversion')} value={overallConversion !== null ? `${overallConversion}%` : '\u2014'} accent />
              <MetricsDivider />
              <Metric label={t('enteredFunnel')} value={totalEntered?.toLocaleString() ?? '\u2014'} />
              <MetricsDivider />
              <Metric label={t('completed')} value={totalConverted?.toLocaleString() ?? '\u2014'} />
            </>
          )}
          {funnelResult?.sampling_factor !== null && funnelResult?.sampling_factor !== undefined && funnelResult.sampling_factor < 1 && (
            <>
              <MetricsDivider />
              <span className={cn('inline-flex items-center gap-1.5 text-xs', STATUS_COLORS.warning)}>
                <FlaskConical className="h-3.5 w-3.5" />
                {t('sampled', { pct: String(Math.round(funnelResult.sampling_factor * 100)) })}
              </span>
            </>
          )}
          <MetricsDivider />
          <PillToggleGroup options={viewModeOptions} value={viewMode} onChange={setViewMode} />
        </>
      }
      onExportCsv={steps ? handleExportCsv : undefined}
      chartClassName="flex-1 overflow-auto p-6 pt-8"
      unsavedGuard={unsavedGuard}
    >
      {isTimeToConvert ? (
        <>
          <TimeToConvertStepSelector
            steps={config.steps}
            fromStep={fromStep}
            toStep={toStep}
            onFromStepChange={setFromStep}
            onToStepChange={setToStep}
          />
          <TimeToConvertChart bins={ttcResult?.bins ?? []} />
        </>
      ) : (
        <FunnelChart
          steps={steps!}
          breakdown={breakdown}
          aggregateSteps={funnelResult?.aggregate_steps}
          conversionRateDisplay={config.conversion_rate_display ?? 'total'}
        />
      )}
    </InsightEditorLayout>
  );
}
