import { useCallback } from 'react';
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
import { retentionToCsv, downloadCsv } from '@/lib/csv-export';
import type { RetentionWidgetConfig } from '@/api/generated/Api';

export default function RetentionEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<RetentionWidgetConfig>({
    type: 'retention',
    defaultName: t('defaultName'),
    defaultConfig: defaultRetentionConfig,
    isConfigValid: (cfg) => cfg.target_event.trim() !== '',
  });

  const { name, setName, description, setDescription, config, setConfig, isSaving, saveError, listPath, handleSave,
    previewId, isConfigValid, isValid, showSkeleton } = editor;

  const { data, isLoading, isFetching } = useRetentionData(config, previewId);
  const result = data?.data;

  const handleExportCsv = useCallback(() => {
    if (!result) return;
    downloadCsv(retentionToCsv(result), 'retention.csv');
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
      queryPanel={<RetentionQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={isConfigValid}
      showSkeleton={showSkeleton(isLoading, data)}
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
      onExportCsv={result ? handleExportCsv : undefined}
      chartClassName="flex-1 overflow-auto p-6 space-y-8"
    >
      {result && <RetentionTable result={result} />}
      {result && <RetentionChart result={result} />}
    </InsightEditorLayout>
  );
}
