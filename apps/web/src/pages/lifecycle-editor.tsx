import { HeartPulse } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useLifecycleData } from '@/features/dashboard/hooks/use-lifecycle';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { LifecycleQueryPanel } from '@/features/dashboard/components/widgets/lifecycle/LifecycleQueryPanel';
import { defaultLifecycleConfig } from '@/features/dashboard/components/widgets/lifecycle/lifecycle-shared';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './lifecycle-editor.translations';
import type { LifecycleWidgetConfig } from '@/api/generated/Api';

export default function LifecycleEditorPage() {
  const { t } = useLocalTranslation(translations);

  const editor = useInsightEditor<LifecycleWidgetConfig>({
    type: 'lifecycle',
    defaultName: t('defaultName'),
    defaultConfig: defaultLifecycleConfig,
    cleanConfig: (c) => c,
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave } = editor;

  const isConfigValid = config.target_event.trim() !== '';
  const isValid = name.trim() !== '' && isConfigValid;

  const previewId = editor.isNew ? 'lifecycle-new' : editor.insightId!;
  const { data, isLoading, isFetching } = useLifecycleData(config, previewId);
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
        <LifecycleQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {!isConfigValid && (
            <EmptyState
              icon={HeartPulse}
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
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              <Skeleton className="h-[300px] w-full" />
            </div>
          )}

          {isConfigValid && !showSkeleton && (!result || result.data.length === 0) && (
            <EmptyState
              icon={HeartPulse}
              title={t('noResultsTitle')}
              description={t('noResultsDescription')}
              className="flex-1"
            />
          )}

          {isConfigValid && !showSkeleton && result && result.data.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label={t('new')} value={String(result.totals.new)} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label={t('returning')} value={String(result.totals.returning)} />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label={t('resurrecting')} value={String(result.totals.resurrecting)} />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label={t('dormant')} value={String(Math.abs(result.totals.dormant))} />
              </div>
              <div className="flex-1 overflow-auto p-6">
                <LifecycleChart result={result} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
