import { useState } from 'react';
import { CalendarDays, Timer, SlidersHorizontal, TrendingDown, GitFork } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { FunnelStepBuilder } from '@/features/dashboard/components/widgets/funnel/FunnelStepBuilder';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

function defaultConfig(): FunnelWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'funnel',
    steps: [
      { event_name: '', label: 'Step 1' },
      { event_name: '', label: 'Step 2' },
    ],
    conversion_window_days: 14,
    date_from: from,
    date_to: to,
  };
}

const DATE_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
] as const;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

export default function FunnelsPage() {
  const [config, setConfig] = useState<FunnelWidgetConfig>(defaultConfig);

  const isConfigValid =
    config.steps.length >= 2 && config.steps.every((s) => s.event_name.trim() !== '');

  const { data, isLoading } = useFunnelData(config, 'funnels-page');
  const steps = data?.data.steps;

  const overallConversion = steps && steps.length > 0 ? steps[steps.length - 1].conversion_rate : null;
  const totalEntered = steps && steps.length > 0 ? steps[0].count : null;
  const totalConverted = steps && steps.length > 0 ? steps[steps.length - 1].count : null;

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
        <aside className="w-[360px] flex-shrink-0 border-r border-border overflow-y-auto">
          <div className="p-5 space-y-6">

            {/* Date range */}
            <section className="space-y-3">
              <SectionHeader icon={CalendarDays} label="Date range" />
              <div className="flex gap-1 flex-wrap">
                {DATE_PRESETS.map(({ label, days }) => {
                  const from = daysAgo(days);
                  const to = today();
                  const active =
                    config.date_from.slice(0, 10) === from &&
                    config.date_to.slice(0, 10) === to;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, date_from: from, date_to: to }))}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={config.date_from.slice(0, 10)}
                    onChange={(e) => setConfig((c) => ({ ...c, date_from: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={config.date_to.slice(0, 10)}
                    onChange={(e) => setConfig((c) => ({ ...c, date_to: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* Steps */}
            <section className="space-y-3">
              <SectionHeader icon={TrendingDown} label="Steps" />
              <FunnelStepBuilder
                steps={config.steps}
                onChange={(steps) => setConfig((c) => ({ ...c, steps }))}
              />
            </section>

            <Separator />

            {/* Conversion window */}
            <section className="space-y-3">
              <SectionHeader icon={Timer} label="Conversion window" />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={config.conversion_window_days}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, conversion_window_days: Number(e.target.value) }))
                  }
                  className="h-8 w-20 text-sm"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </section>

            <Separator />

            {/* Breakdown */}
            <section className="space-y-3">
              <SectionHeader icon={SlidersHorizontal} label="Breakdown" />
              <Input
                value={config.breakdown_property || ''}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    breakdown_property: e.target.value || undefined,
                  }))
                }
                placeholder="e.g. country, plan, properties.utm_source"
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Split results by a user or event property
              </p>
            </section>
          </div>
        </aside>

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
            <div className="flex flex-col gap-6 p-8">
              <div className="flex items-end gap-8 border-b border-border pb-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Overall conversion</p>
                  <p className="text-3xl font-bold tabular-nums">{overallConversion}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Entered funnel</p>
                  <p className="text-3xl font-bold tabular-nums">
                    {totalEntered?.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Completed</p>
                  <p className="text-3xl font-bold tabular-nums">
                    {totalConverted?.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="w-full">
                <FunnelChart steps={steps} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
