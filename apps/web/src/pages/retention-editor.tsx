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
import type { RetentionWidgetConfig } from '@/api/generated/Api';

export default function RetentionEditorPage() {
  const editor = useInsightEditor<RetentionWidgetConfig>({
    type: 'retention',
    basePath: '/insights/retentions',
    listBasePath: '/insights',
    defaultName: 'Untitled retention',
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
        backLabel="Insights"
        name={name}
        onNameChange={setName}
        placeholder="Untitled retention"
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
              title="Configure your retention"
              description="Select a target event to see retention data"
              className="flex-1 p-8 py-0"
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
              title="No results found"
              description="No events match in the selected date range"
              className="flex-1 p-8 py-0"
            />
          )}

          {isConfigValid && !showSkeleton && result && result.cohorts.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label="Cohorts" value={String(result.cohorts.length)} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric
                  label="Avg Day 1 Retention"
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
