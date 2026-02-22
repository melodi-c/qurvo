import { Route } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { usePathsData } from '@/features/dashboard/hooks/use-paths';
import { PathsChart } from '@/features/dashboard/components/widgets/paths/PathsChart';
import { PathsQueryPanel } from '@/features/dashboard/components/widgets/paths/PathsQueryPanel';
import { defaultPathsConfig } from '@/features/dashboard/components/widgets/paths/paths-shared';
import type { PathsWidgetConfig } from '@/api/generated/Api';

export default function PathsEditorPage() {
  const editor = useInsightEditor<PathsWidgetConfig>({
    type: 'paths',
    basePath: '/insights/paths',
    listBasePath: '/insights',
    defaultName: 'Untitled paths',
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

  // Compute unique users from step 1 transitions
  const totalUsers = transitions
    ? transitions
        .filter((t) => t.step === 1)
        .reduce((sum, t) => sum + t.person_count, 0)
    : 0;

  const totalPaths = result?.top_paths?.length ?? 0;

  return (
    <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel="Insights"
        name={name}
        onNameChange={setName}
        placeholder="Untitled paths"
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        <PathsQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {showSkeleton && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              <div className="flex gap-8">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              <Skeleton className="h-[300px] w-full" />
            </div>
          )}

          {!showSkeleton && (!transitions || transitions.length === 0) && (
            <EmptyState
              icon={Route}
              title="No paths found"
              description="No event sequences found in the selected date range. Try adjusting filters."
              className="flex-1"
            />
          )}

          {!showSkeleton && transitions && transitions.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label="Unique users" value={totalUsers.toLocaleString()} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Top paths" value={String(totalPaths)} />
              </div>
              <div className="flex-1 overflow-auto p-6 pt-8">
                <PathsChart
                  transitions={transitions}
                  topPaths={result?.top_paths ?? []}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
