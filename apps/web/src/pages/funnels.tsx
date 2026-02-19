import { useState } from 'react';
import { TrendingDown, GitFork } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { FunnelQueryPanel } from '@/features/dashboard/components/widgets/funnel/FunnelQueryPanel';
import { getFunnelMetrics } from '@/features/dashboard/components/widgets/funnel/funnel-utils';
import { defaultFunnelConfig, Metric } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import type { FunnelWidgetConfig } from '@/api/generated/Api';
// FunnelWidgetConfig is a discriminated union member from generated Api

export default function FunnelsPage() {
  const [config, setConfig] = useState<FunnelWidgetConfig>(defaultFunnelConfig);

  const isConfigValid =
    config.steps.length >= 2 && config.steps.every((s) => s.event_name.trim() !== '');

  const { data, isLoading } = useFunnelData(config, 'funnels-page');
  const funnelResult = data?.data;
  const steps = funnelResult?.steps;
  const breakdown = funnelResult?.breakdown;

  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(funnelResult);

  return (
    <div className="-m-6 h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 border-b border-border bg-background px-5 h-14 flex-shrink-0">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
          <GitFork className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Funnel</span>
        </div>
        <h1 className="text-base font-semibold">Funnels</h1>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left panel: Query builder ── */}
        <FunnelQueryPanel config={config} onChange={setConfig} />

        {/* ── Right panel: Visualization ── */}
        <main className="flex-1 overflow-auto flex flex-col">

          {/* Not configured */}
          {!isConfigValid && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <TrendingDown className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Configure your funnel</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add at least 2 steps with event names to see results
                </p>
              </div>
            </div>
          )}

          {/* Loading */}
          {isConfigValid && isLoading && (
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

          {/* No data */}
          {isConfigValid && !isLoading && (!steps || steps.length === 0) && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <GitFork className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No results found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No events match these steps in the selected date range
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {isConfigValid && !isLoading && steps && steps.length > 0 && (
            <div className="flex flex-col h-full">
              {/* Metric strip */}
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label="Overall conversion" value={`${overallConversion}%`} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Entered funnel" value={totalEntered?.toLocaleString() ?? '\u2014'} />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Completed" value={totalConverted?.toLocaleString() ?? '\u2014'} />
              </div>
              {/* Chart */}
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
