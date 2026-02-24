import { GitFork, TrendingDown, FlaskConical } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { InsightEditorLayout } from '@/components/InsightEditorLayout';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useFunnelData, cleanSteps } from '@/features/dashboard/hooks/use-funnel';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { FunnelQueryPanel } from '@/features/dashboard/components/widgets/funnel/FunnelQueryPanel';
import { getFunnelMetrics } from '@/features/dashboard/components/widgets/funnel/funnel-utils';
import { defaultFunnelConfig } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './funnel-editor.translations';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

function cleanFunnelConfig(config: FunnelWidgetConfig): FunnelWidgetConfig {
  return { ...config, steps: cleanSteps(config) };
}

export default function FunnelEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<FunnelWidgetConfig>({
    type: 'funnel',
    defaultName: t('defaultName'),
    defaultConfig: defaultFunnelConfig,
    cleanConfig: cleanFunnelConfig,
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave } = editor;

  const isConfigValid =
    config.steps.length >= 2 && config.steps.every((s) => s.event_name.trim() !== '');
  const isValid = name.trim() !== '' && isConfigValid;

  const previewId = editor.isNew ? 'funnel-new' : editor.insightId!;
  const { data, isLoading, isFetching } = useFunnelData(config, previewId);
  const funnelResult = data?.data;
  const steps = funnelResult?.steps;
  const breakdown = funnelResult?.breakdown;
  const showSkeleton = isLoading && !data;
  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(funnelResult);

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
      queryPanel={<FunnelQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={isConfigValid}
      showSkeleton={showSkeleton}
      isEmpty={!steps || steps.length === 0}
      isFetching={isFetching}
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
          <Metric label={t('overallConversion')} value={`${overallConversion}%`} accent />
          <MetricsDivider />
          <Metric label={t('enteredFunnel')} value={totalEntered?.toLocaleString() ?? '\u2014'} />
          <MetricsDivider />
          <Metric label={t('completed')} value={totalConverted?.toLocaleString() ?? '\u2014'} />
          {funnelResult?.sampling_factor != null && funnelResult.sampling_factor < 1 && (
            <>
              <MetricsDivider />
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400/80">
                <FlaskConical className="h-3.5 w-3.5" />
                {t('sampled', { pct: String(Math.round(funnelResult.sampling_factor * 100)) })}
              </span>
            </>
          )}
        </>
      }
      chartClassName="flex-1 overflow-auto p-6 pt-8"
    >
      <FunnelChart
        steps={steps!}
        breakdown={breakdown}
        aggregateSteps={funnelResult?.aggregate_steps}
        conversionRateDisplay={config.conversion_rate_display ?? 'total'}
      />
    </InsightEditorLayout>
  );
}
