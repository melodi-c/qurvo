import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { GitFork, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorHeader } from '@/components/ui/editor-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { useInsight, useCreateInsight, useUpdateInsight } from '@/features/insights/hooks/use-insights';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { FunnelQueryPanel } from '@/features/dashboard/components/widgets/funnel/FunnelQueryPanel';
import { getFunnelMetrics } from '@/features/dashboard/components/widgets/funnel/funnel-utils';
import { defaultFunnelConfig } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

export default function FunnelEditorPage() {
  const { insightId } = useParams<{ insightId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  const isNew = !insightId;
  const { data: insight } = useInsight(insightId ?? '');

  const [name, setName] = useState('Untitled funnel');
  const [config, setConfig] = useState<FunnelWidgetConfig>(defaultFunnelConfig);
  const initialized = useRef(isNew);

  useEffect(() => {
    if (!initialized.current && insight) {
      setName(insight.name);
      setConfig(insight.config as FunnelWidgetConfig);
      initialized.current = true;
    }
  }, [insight]);

  const createMutation = useCreateInsight();
  const updateMutation = useUpdateInsight();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const [saveError, setSaveError] = useState<string | null>(null);

  const listPath = `/funnels?project=${projectId}`;

  // Funnel data
  const isConfigValid =
    config.steps.length >= 2 && config.steps.every((s) => s.event_name.trim() !== '');
  const previewId = isNew ? 'funnel-new' : insightId!;
  const { data, isLoading, isFetching } = useFunnelData(config, previewId);
  const funnelResult = data?.data;
  const steps = funnelResult?.steps;
  const breakdown = funnelResult?.breakdown;
  const showSkeleton = isLoading && !data;
  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(funnelResult);

  const isValid = name.trim() !== '' && isConfigValid;

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setSaveError(null);

    const cleanConfig: FunnelWidgetConfig = {
      ...config,
      steps: config.steps.map((s) => ({
        ...s,
        filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
      })),
    };

    try {
      if (isNew) {
        await createMutation.mutateAsync({
          type: 'funnel',
          name,
          config: cleanConfig,
        });
      } else {
        await updateMutation.mutateAsync({
          insightId: insightId!,
          data: { name, config: cleanConfig },
        });
      }
      navigate(listPath);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  return (
    <div className="-m-6 h-full flex flex-col overflow-hidden">
      <EditorHeader
        backPath={listPath}
        backLabel="Funnels"
        name={name}
        onNameChange={setName}
        placeholder="Untitled funnel"
        onSave={handleSave}
        isSaving={isSaving}
        isValid={isValid}
        saveError={saveError}
      />

      <div className="flex flex-1 min-h-0">
        <FunnelQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {!isConfigValid && (
            <EmptyState
              icon={TrendingDown}
              title="Configure your funnel"
              description="Add at least 2 steps with event names to see results"
              className="flex-1 p-8 py-0"
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
              className="flex-1 p-8 py-0"
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
