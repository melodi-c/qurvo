import { Layers } from 'lucide-react';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { EditorSkeleton } from '@/components/ui/editor-skeleton';
import { InsightEditorLayout } from '@/components/InsightEditorLayout';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useStickinessData } from '@/features/dashboard/hooks/use-stickiness';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';
import { StickinessQueryPanel } from '@/features/dashboard/components/widgets/stickiness/StickinessQueryPanel';
import { defaultStickinessConfig } from '@/features/dashboard/components/widgets/stickiness/stickiness-shared';
import { formatGranularity } from '@/lib/formatting';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './stickiness-editor.translations';
import type { StickinessWidgetConfig } from '@/api/generated/Api';

export default function StickinessEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<StickinessWidgetConfig>({
    type: 'stickiness',
    defaultName: t('defaultName'),
    defaultConfig: defaultStickinessConfig,
    isConfigValid: (cfg) => cfg.target_event.trim() !== '',
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave,
    previewId, isConfigValid, isValid, showSkeleton } = editor;

  const { data, isLoading, isFetching } = useStickinessData(config, previewId);
  const result = data?.data;

  const totalUsers = result?.data.reduce((sum, d) => sum + d.user_count, 0) ?? 0;
  const modePeriod = result?.data.length
    ? result.data.reduce((max, d) => (d.user_count > max.user_count ? d : max), result.data[0]).period_count
    : 0;

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
      queryPanel={<StickinessQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={isConfigValid}
      showSkeleton={showSkeleton(isLoading, data)}
      isEmpty={!result || result.data.length === 0}
      isFetching={isFetching}
      configureIcon={Layers}
      configureTitle={t('configureTitle')}
      configureDescription={t('configureDescription')}
      noResultsIcon={Layers}
      noResultsTitle={t('noResultsTitle')}
      noResultsDescription={t('noResultsDescription')}
      skeleton={<EditorSkeleton metricCount={3} />}
      metricsBar={
        <>
          <Metric label={t('totalUsers')} value={String(totalUsers)} accent />
          <MetricsDivider />
          <Metric label={t('mostCommon')} value={`${modePeriod} ${formatGranularity(modePeriod, result?.granularity ?? 'day')}`} />
          <MetricsDivider />
          <Metric label={t('totalPeriods')} value={String(result?.total_periods ?? 0)} />
        </>
      }
    >
      {result && <StickinessChart result={result} />}
    </InsightEditorLayout>
  );
}
