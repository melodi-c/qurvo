import { useState, useCallback } from 'react';
import { PersonsModal } from '@/features/persons/components/PersonsModal';
import { usePersonsAtStickinessBar, type StickinessBarParams } from '@/features/persons/hooks/use-persons-at-point';
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
import { stickinessToCsv, downloadCsv } from '@/lib/csv-export';
import type { StickinessWidgetConfig } from '@/api/generated/Api';

export default function StickinessEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<StickinessWidgetConfig>({
    type: 'stickiness',
    defaultName: t('defaultName'),
    defaultConfig: defaultStickinessConfig,
    isConfigValid: (cfg) => cfg.target_event.trim() !== '',
  });

  const { name, setName, description, setDescription, config, setConfig, isSaving, saveError, listPath, handleSave,
    previewId, insightId, isConfigValid, isValid, showSkeleton, unsavedGuard } = editor;

  const { data, isLoading, isFetching } = useStickinessData(config, previewId);
  const result = data?.data;

  const handleExportCsv = useCallback(() => {
    if (!result) {return;}
    downloadCsv(stickinessToCsv(result), 'stickiness.csv');
  }, [result]);

  // Persons modal state
  const [personsModal, setPersonsModal] = useState<{ title: string; params: StickinessBarParams } | null>(null);
  const [personsPage, setPersonsPage] = useState(0);
  const personsQuery = usePersonsAtStickinessBar(personsModal?.params ?? null, personsPage);

  const handleBarClick = useCallback((periodCount: number) => {
    setPersonsModal({
      title: t('personsAtPeriod', { count: String(periodCount) }),
      params: {
        event_name: config.target_event,
        granularity: config.granularity,
        period_count: periodCount,
        date_from: config.date_from,
        date_to: config.date_to,
        filters: config.filters,
      },
    });
    setPersonsPage(0);
  }, [config, t]);

  const totalUsers = result?.data.reduce((sum, d) => sum + d.user_count, 0) ?? 0;
  const modePeriod = result?.data.length
    ? result.data.reduce((max, d) => (d.user_count > max.user_count ? d : max), result.data[0]).period_count
    : 0;

  return (
    <>
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
      onExportCsv={result ? handleExportCsv : undefined}
      unsavedGuard={unsavedGuard}
    >
      {result && <StickinessChart result={result} onBarClick={handleBarClick} />}
    </InsightEditorLayout>
    <PersonsModal
      open={!!personsModal}
      onOpenChange={(open) => { if (!open) {setPersonsModal(null);} }}
      title={personsModal?.title ?? ''}
      query={personsQuery}
      page={personsPage}
      onPageChange={setPersonsPage}
    />
    </>
  );
}
