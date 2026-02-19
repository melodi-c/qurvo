import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, GitFork, Save, TrendingDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard, useAddWidget, useUpdateWidget } from '@/features/dashboard/hooks/use-dashboard';
import { useDashboardStore } from '@/features/dashboard/store';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { FunnelQueryPanel } from '@/features/dashboard/components/widgets/funnel/FunnelQueryPanel';
import { getFunnelMetrics } from '@/features/dashboard/components/widgets/funnel/funnel-utils';
import { defaultFunnelConfig, Metric } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

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
  const breakdown = data?.data.breakdown;

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

  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(data?.data);

  return (
    <div className="-m-6 h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 border-b border-border bg-background px-5 h-14 flex-shrink-0">
        <Link
          to={dashboardPath}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="max-w-[140px] truncate">{dashboard?.name ?? '\u2026'}</span>
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
            {isSaving ? 'Saving\u2026' : 'Save to dashboard'}
          </Button>
        </div>
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
                <FunnelChart steps={steps} breakdown={breakdown} aggregateSteps={data?.data.aggregate_steps} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
