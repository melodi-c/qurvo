import { CalendarCheck } from 'lucide-react';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { EditorSkeleton } from '@/components/ui/editor-skeleton';
import { InsightEditorLayout } from '@/components/InsightEditorLayout';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useRetentionData } from '@/features/dashboard/hooks/use-retention';
import { RetentionTable } from '@/features/dashboard/components/widgets/retention/RetentionTable';
import { RetentionChart } from '@/features/dashboard/components/widgets/retention/RetentionChart';
import { RetentionQueryPanel } from '@/features/dashboard/components/widgets/retention/RetentionQueryPanel';
import { defaultRetentionConfig } from '@/features/dashboard/components/widgets/retention/retention-shared';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './retention-editor.translations';
import type { RetentionWidgetConfig } from '@/api/generated/Api';

export default function RetentionEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<RetentionWidgetConfig>({
    type: 'retention',
    defaultName: t('defaultName'),
    defaultConfig: defaultRetentionConfig,
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave } = editor;

  const isConfigValid = config.target_event.trim() !== '';
  const isValid = name.trim() !== '' && isConfigValid;

  const previewId = editor.isNew ? 'retention-new' : editor.insightId!;
  const { data, isLoading, isFetching } = useRetentionData(config, previewId);
  const result = data?.data;
  const showSkeleton = isLoading && !data;

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
      queryPanel={<RetentionQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={isConfigValid}
      showSkeleton={showSkeleton}
      isEmpty={!result || result.cohorts.length === 0}
      isFetching={isFetching}
      configureIcon={CalendarCheck}
      configureTitle={t('configureTitle')}
      configureDescription={t('configureDescription')}
      noResultsIcon={CalendarCheck}
      noResultsTitle={t('noResultsTitle')}
      noResultsDescription={t('noResultsDescription')}
      skeleton={<EditorSkeleton metricCount={2} />}
      metricsBar={
        <>
          <Metric label={t('cohorts')} value={String(result?.cohorts?.length ?? 0)} accent />
          <MetricsDivider />
          <Metric
            label={t('avgDay1Retention')}
            value={result?.average_retention?.[1] !== undefined ? `${result.average_retention[1].toFixed(1)}%` : '\u2014'}
          />
        </>
      }
      chartClassName="flex-1 overflow-auto p-6 space-y-8"
    >
      {result && <RetentionTable result={result} />}
      {result && <RetentionChart result={result} />}
    </InsightEditorLayout>
  );
}
