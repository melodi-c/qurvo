import { GitFork, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { useInsightEditor } from '@/features/insights/hooks/use-insight-editor';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { FunnelQueryPanel } from '@/features/dashboard/components/widgets/funnel/FunnelQueryPanel';
import { getFunnelMetrics } from '@/features/dashboard/components/widgets/funnel/funnel-utils';
import { defaultFunnelConfig } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

function cleanFunnelConfig(config: FunnelWidgetConfig): FunnelWidgetConfig {
  return {
    ...config,
    steps: config.steps.map((s) => ({
      ...s,
      filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
    })),
  };
}

export default function FunnelEditorPage() {
  const editor = useInsightEditor<FunnelWidgetConfig>({
    type: 'funnel',
    defaultName: 'Untitled funnel',
    defaultConfig: defaultFunnelConfig,
    cleanConfig: cleanFunnelConfig,
  });

  const { name, setName, config, setConfig, isSaving, saveError, listPath, handleSave } = editor;

  const isConfigValid =
    config.steps.length >= 2 && config.steps.every((s) => s.event_name.trim() !== '');
  const isValid = name.trim() !== '' && isConfigValid;

  const previewId = editor.isNew ? 'funnel-new' : editor.insightId!;
  const { data, isLoading, isFetching } = useFunnelData(config, previewId);
  const funnelResult = data?.data;
  const steps = funnelResult?.steps;
  const breakdown = funnelResult?.breakdown;
  const showSkeleton = isLoading && !data;
  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(funnelResult);

  return (
    <div className="-m-4 lg:-m-6 flex flex-col lg:h-full lg:overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel="Insights"
        name={name}
        onNameChange={setName}
        placeholder="Untitled funnel"
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">
        <FunnelQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {!isConfigValid && (
            <EmptyState
              icon={TrendingDown}
              title="Configure your funnel"
              description="Add at least 2 steps with event names to see results"
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
              <div className="space-y-3 max-w-2xl">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-[75%]" />
                <Skeleton className="h-10 w-[55%]" />
                <Skeleton className="h-10 w-[35%]" />
              </div>
            </div>
          )}

          {isConfigValid && !showSkeleton && (!steps || steps.length === 0) && (
            <EmptyState
              icon={GitFork}
              title="No results found"
              description="No events match these steps in the selected date range"
              className="flex-1"
            />
          )}

          {isConfigValid && !showSkeleton && steps && steps.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label="Overall conversion" value={`${overallConversion}%`} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Entered funnel" value={totalEntered?.toLocaleString() ?? '\u2014'} />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Completed" value={totalConverted?.toLocaleString() ?? '\u2014'} />
              </div>
              <div className="flex-1 overflow-auto p-6 pt-8">
                <FunnelChart steps={steps} breakdown={breakdown} aggregateSteps={funnelResult?.aggregate_steps} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
