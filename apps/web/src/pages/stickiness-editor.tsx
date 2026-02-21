import { Layers } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useStickinessData } from '@/features/dashboard/hooks/use-stickiness';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';
import { StickinessQueryPanel } from '@/features/dashboard/components/widgets/stickiness/StickinessQueryPanel';
import { defaultStickinessConfig } from '@/features/dashboard/components/widgets/stickiness/stickiness-shared';
import type { StickinessWidgetConfig } from '@/api/generated/Api';

export default function StickinessEditorPage() {
  const editor = useInsightEditor<StickinessWidgetConfig>({
    type: 'stickiness',
    basePath: '/insights/stickiness',
    listBasePath: '/insights',
    defaultName: 'Untitled stickiness',
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
    <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel="Insights"
        name={name}
        onNameChange={setName}
        placeholder="Untitled stickiness"
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        <StickinessQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {!isConfigValid && (
            <EmptyState
              icon={Layers}
              title="Configure your stickiness"
              description="Select a target event to see stickiness data"
              className="flex-1"
            />
          )}

          {isConfigValid && showSkeleton && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              <div className="flex gap-8">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              <Skeleton className="h-[300px] w-full" />
            </div>
          )}

          {isConfigValid && !showSkeleton && (!result || result.data.length === 0) && (
            <EmptyState
              icon={Layers}
              title="No results found"
              description="No events match in the selected date range"
              className="flex-1"
            />
          )}

          {isConfigValid && !showSkeleton && result && result.data.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label="Total users" value={String(totalUsers)} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Most common" value={`${modePeriod} ${result.granularity}${modePeriod !== 1 ? 's' : ''}`} />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Total periods" value={String(result.total_periods)} />
              </div>
              <div className="flex-1 overflow-auto p-6">
                <StickinessChart result={result} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
