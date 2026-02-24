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
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './stickiness-editor.translations';
import type { StickinessWidgetConfig } from '@/api/generated/Api';

export default function StickinessEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<StickinessWidgetConfig>({
    type: 'stickiness',
    defaultName: t('defaultName'),
    defaultConfig: defaultStickinessConfig,
    cleanConfig: (c) => c,
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave } = editor;

  const isConfigValid = config.target_event.trim() !== '';
  const isValid = name.trim() !== '' && isConfigValid;

  const previewId = editor.isNew ? 'stickiness-new' : editor.insightId!;
  const { data, isLoading, isFetching } = useStickinessData(config, previewId);
  const result = data?.data;
  const showSkeleton = isLoading && !data;

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
      showSkeleton={showSkeleton}
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
          <Metric label={t('mostCommon')} value={`${modePeriod} ${result!.granularity}${modePeriod !== 1 ? 's' : ''}`} />
          <MetricsDivider />
          <Metric label={t('totalPeriods')} value={String(result!.total_periods)} />
        </>
      }
    >
      <StickinessChart result={result!} />
    </InsightEditorLayout>
  );
}
