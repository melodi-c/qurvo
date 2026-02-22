import { CalendarCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
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
    cleanConfig: (c) => c,
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave } = editor;

  const isConfigValid = config.target_event.trim() !== '';
  const isValid = name.trim() !== '' && isConfigValid;

  const previewId = editor.isNew ? 'retention-new' : editor.insightId!;
  const { data, isLoading, isFetching } = useRetentionData(config, previewId);
  const result = data?.data;
  const showSkeleton = isLoading && !data;

  return (
    <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel={t('backLabel')}
        name={name}
        onNameChange={setName}
        placeholder={t('placeholder')}
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        <RetentionQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {!isConfigValid && (
            <EmptyState
              icon={CalendarCheck}
              title={t('configureTitle')}
              description={t('configureDescription')}
              className="flex-1"
            />
          )}

          {isConfigValid && showSkeleton && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              <div className="flex gap-8">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              <Skeleton className="h-[300px] w-full" />
            </div>
          )}

          {isConfigValid && !showSkeleton && (!result || result.cohorts.length === 0) && (
            <EmptyState
              icon={CalendarCheck}
              title={t('noResultsTitle')}
              description={t('noResultsDescription')}
              className="flex-1"
            />
          )}

          {isConfigValid && !showSkeleton && result && result.cohorts.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label={t('cohorts')} value={String(result.cohorts.length)} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric
                  label={t('avgDay1Retention')}
                  value={result.average_retention[1] !== undefined ? `${result.average_retention[1].toFixed(1)}%` : '\u2014'}
                />
              </div>
              <div className="flex-1 overflow-auto p-6 space-y-8">
                <RetentionTable result={result} />
                <RetentionChart result={result} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
