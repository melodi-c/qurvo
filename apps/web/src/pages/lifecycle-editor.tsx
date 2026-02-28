import { useCallback } from 'react';
import { HeartPulse } from 'lucide-react';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { EditorSkeleton } from '@/components/ui/editor-skeleton';
import { InsightEditorLayout } from '@/components/InsightEditorLayout';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useLifecycleData } from '@/features/dashboard/hooks/use-lifecycle';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { LifecycleQueryPanel } from '@/features/dashboard/components/widgets/lifecycle/LifecycleQueryPanel';
import { defaultLifecycleConfig } from '@/features/dashboard/components/widgets/lifecycle/lifecycle-shared';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './lifecycle-editor.translations';
import { lifecycleToCsv, downloadCsv } from '@/lib/csv-export';
import type { LifecycleWidgetConfig } from '@/api/generated/Api';

export default function LifecycleEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<LifecycleWidgetConfig>({
    type: 'lifecycle',
    defaultName: t('defaultName'),
    defaultConfig: defaultLifecycleConfig,
    isConfigValid: (cfg) => cfg.target_event.trim() !== '',
  });

  const { name, setName, description, setDescription, config, setConfig, isSaving, saveError, listPath, handleSave,
    previewId, isConfigValid, isValid, showSkeleton, unsavedGuard } = editor;

  const { data, isLoading, isFetching } = useLifecycleData(config, previewId);
  const result = data?.data;

  const handleExportCsv = useCallback(() => {
    if (!result) return;
    downloadCsv(lifecycleToCsv(result), 'lifecycle.csv');
  }, [result]);

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
      queryPanel={<LifecycleQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={isConfigValid}
      showSkeleton={showSkeleton(isLoading, data)}
      isEmpty={!result || result.data.length === 0}
      isFetching={isFetching}
      configureIcon={HeartPulse}
      configureTitle={t('configureTitle')}
      configureDescription={t('configureDescription')}
      noResultsIcon={HeartPulse}
      noResultsTitle={t('noResultsTitle')}
      noResultsDescription={t('noResultsDescription')}
      skeleton={<EditorSkeleton metricCount={4} />}
      metricsBar={
        <>
          <Metric label={t('new')} value={String(result?.totals?.new ?? 0)} accent />
          <MetricsDivider />
          <Metric label={t('returning')} value={String(result?.totals?.returning ?? 0)} />
          <MetricsDivider />
          <Metric label={t('resurrecting')} value={String(result?.totals?.resurrecting ?? 0)} />
          <MetricsDivider />
          <Metric label={t('dormant')} value={String(Math.abs(result?.totals?.dormant ?? 0))} />
        </>
      }
      onExportCsv={result ? handleExportCsv : undefined}
      unsavedGuard={unsavedGuard}
    >
      {result && <LifecycleChart result={result} />}
    </InsightEditorLayout>
  );
}
