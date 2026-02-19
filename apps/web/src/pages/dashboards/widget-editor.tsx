import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, GitFork, Save, CalendarDays, Timer, SlidersHorizontal, TrendingDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard, useAddWidget, useUpdateWidget } from '@/features/dashboard/hooks/use-dashboard';
import { useDashboardStore } from '@/features/dashboard/store';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { FunnelStepBuilder } from '@/features/dashboard/components/widgets/funnel/FunnelStepBuilder';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import type { FunnelWidgetConfig, Widget } from '@/api/generated/Api';

function defaultFunnelConfig(): FunnelWidgetConfig {
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

export default function WidgetEditorPage() {
  const { id: dashboardId, widgetId } = useParams<{ id: string; widgetId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  const isNew = widgetId === 'new';
  const { data: dashboard } = useDashboard(dashboardId!);
  const store = useDashboardStore();

  const storeWidget = isNew ? null : store.localWidgets.find((w) => w.id === widgetId);
  const apiWidget = isNew
    ? null
    : dashboard?.widgets?.find((w) => w.id === widgetId);
  const sourceWidget = storeWidget ?? apiWidget;

  const [name, setName] = useState(isNew ? 'Untitled funnel' : '');
  const [config, setConfig] = useState<FunnelWidgetConfig>(defaultFunnelConfig);
  const initialized = useRef(isNew);

  useEffect(() => {
    if (!initialized.current && sourceWidget) {
      setName(sourceWidget.name);
      setConfig(sourceWidget.config);
      initialized.current = true;
    }
  }, [sourceWidget?.id]);

  const addWidgetMutation = useAddWidget();
  const updateWidgetMutation = useUpdateWidget();
  const isSaving = addWidgetMutation.isPending || updateWidgetMutation.isPending;
  const [saveError, setSaveError] = useState<string | null>(null);

  const previewId = isNew ? 'preview' : widgetId!;
  const { data, isLoading } = useFunnelData(config, previewId);
  const steps = data?.data.steps;

  const isConfigValid =
    config.steps.length >= 2 && config.steps.every((s) => s.event_name.trim() !== '');
  const isValid = name.trim() !== '' && isConfigValid;

  const dashboardPath = `/dashboards/${dashboardId}${projectId ? `?project=${projectId}` : ''}`;

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setSaveError(null);
    // Strip filters with empty property before persisting
    const cleanConfig: FunnelWidgetConfig = {
      ...config,
      steps: config.steps.map((s) => ({
        ...s,
        filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
      })),
    };
    try {
      if (isNew) {
        const maxY = store.localLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
        const layout = { x: 0, y: maxY, w: 6, h: 4 };
        const created = await addWidgetMutation.mutateAsync({
          dashboardId: dashboardId!,
          widget: { type: 'funnel', name, config: cleanConfig, layout },
        });
        store.addWidget({ ...created, layout });
      } else {
        await updateWidgetMutation.mutateAsync({
          dashboardId: dashboardId!,
          widgetId: widgetId!,
          patch: { name, config: cleanConfig },
        });
        store.updateWidgetConfig(widgetId!, cleanConfig, name);
      }
      navigate(dashboardPath);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    }
  };

  const overallConversion = steps && steps.length > 0 ? steps[steps.length - 1].conversion_rate : null;
  const totalEntered = steps && steps.length > 0 ? steps[0].count : null;
  const totalConverted = steps && steps.length > 0 ? steps[steps.length - 1].count : null;

  return (
    <div className="-m-6 h-full flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 border-b border-border bg-background px-5 h-14 flex-shrink-0">
        <Link
          to={dashboardPath}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="max-w-[140px] truncate">{dashboard?.name ?? '…'}</span>
        </Link>

        <Separator orientation="vertical" className="h-5" />

        {/* Insight type badge */}
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
          <GitFork className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Funnel</span>
        </div>

        {/* Name input */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Untitled funnel"
          className="flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/40 min-w-0"
        />

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {saveError && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground" disabled={isSaving}>
            <Link to={dashboardPath}>Discard</Link>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isValid || isSaving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? 'Saving…' : 'Save to dashboard'}
          </Button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left panel: Query builder ────────────────────────────── */}
        <aside className="w-[360px] flex-shrink-0 border-r border-border overflow-y-auto">
          <div className="p-5 space-y-6">

            {/* Date range */}
            <section className="space-y-3">
              <SectionHeader icon={CalendarDays} label="Date range" />

              {/* Presets */}
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

        {/* ── Right panel: Visualization ───────────────────────────── */}
        <main className="flex-1 overflow-auto flex flex-col">

          {/* — Not configured — */}
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

          {/* — Loading — */}
          {isConfigValid && isLoading && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              <div className="flex gap-8">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              <div className="space-y-3 max-w-2xl">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-[75%]" />
                <Skeleton className="h-10 w-[55%]" />
              </div>
            </div>
          )}

          {/* — No data — */}
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

          {/* — Results — */}
          {isConfigValid && !isLoading && steps && steps.length > 0 && (
            <div className="flex flex-col gap-6 p-8">
              {/* Metrics row */}
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

              {/* Chart */}
              <div className="max-w-3xl">
                <FunnelChart steps={steps} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
