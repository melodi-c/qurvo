import { Route } from 'lucide-react';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { EditorSkeleton } from '@/components/ui/editor-skeleton';
import { InsightEditorLayout } from '@/components/InsightEditorLayout';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { usePathsData } from '@/features/dashboard/hooks/use-paths';
import { PathsChart } from '@/features/dashboard/components/widgets/paths/PathsChart';
import { PathsQueryPanel } from '@/features/dashboard/components/widgets/paths/PathsQueryPanel';
import { defaultPathsConfig } from '@/features/dashboard/components/widgets/paths/paths-shared';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './paths-editor.translations';
import type { PathsWidgetConfig } from '@/api/generated/Api';

export default function PathsEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<PathsWidgetConfig>({
    type: 'paths',
    defaultName: t('defaultName'),
    defaultConfig: defaultPathsConfig,
    cleanConfig: (config) => config,
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave } = editor;

  const isValid = name.trim() !== '';

  const previewId = editor.isNew ? 'paths-new' : editor.insightId!;
  const { data, isLoading, isFetching } = usePathsData(config, previewId);
  const result = data?.data;
  const transitions = result?.transitions;
  const showSkeleton = isLoading && !data;

  const totalUsers = transitions
    ? transitions
        .filter((tr) => tr.step === 1)
        .reduce((sum, tr) => sum + tr.person_count, 0)
    : 0;

  const totalPaths = result?.top_paths?.length ?? 0;

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
      queryPanel={<PathsQueryPanel config={config} onChange={setConfig} />}
      isConfigValid={true}
      showSkeleton={showSkeleton}
      isEmpty={!transitions || transitions.length === 0}
      isFetching={isFetching}
      configureIcon={Route}
      configureTitle=""
      configureDescription=""
      noResultsIcon={Route}
      noResultsTitle={t('noPathsTitle')}
      noResultsDescription={t('noPathsDescription')}
      skeleton={<EditorSkeleton metricCount={2} />}
      metricsBar={
        <>
          <Metric label={t('uniqueUsers')} value={totalUsers.toLocaleString()} accent />
          <MetricsDivider />
          <Metric label={t('topPaths')} value={String(totalPaths)} />
        </>
      }
      chartClassName="flex-1 overflow-auto p-6 pt-8"
    >
      <PathsChart
        transitions={transitions!}
        topPaths={result?.top_paths ?? []}
      />
    </InsightEditorLayout>
  );
}
