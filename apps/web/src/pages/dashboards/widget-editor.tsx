import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, GitFork, TrendingUp, Save, TrendingDown, BarChart3, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard, useAddWidget, useUpdateWidget } from '@/features/dashboard/hooks/use-dashboard';
import { useDashboardStore } from '@/features/dashboard/store';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { FunnelQueryPanel } from '@/features/dashboard/components/widgets/funnel/FunnelQueryPanel';
import { getFunnelMetrics } from '@/features/dashboard/components/widgets/funnel/funnel-utils';
import { defaultFunnelConfig, Metric } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import { TrendQueryPanel } from '@/features/dashboard/components/widgets/trend/TrendQueryPanel';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { defaultTrendConfig, METRIC_OPTIONS } from '@/features/dashboard/components/widgets/trend/trend-shared';
import type { FunnelWidgetConfig, TrendWidgetConfig } from '@/api/generated/Api';

type WidgetType = 'funnel' | 'trend';

export default function WidgetEditorPage() {
  const { id: dashboardId, widgetId } = useParams<{ id: string; widgetId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  const isNew = !widgetId || widgetId === 'new';
  const { data: dashboard } = useDashboard(dashboardId!);
  const store = useDashboardStore();

  const storeWidget = isNew ? null : store.localWidgets.find((w) => w.id === widgetId);
  const apiWidget = isNew ? null : dashboard?.widgets?.find((w) => w.id === widgetId);
  const sourceWidget = storeWidget ?? apiWidget;

  // Determine widget type
  const resolvedType: WidgetType = isNew
    ? ((searchParams.get('type') as WidgetType) || 'funnel')
    : ((sourceWidget?.type as WidgetType) || 'funnel');

  const defaultName = resolvedType === 'trend' ? 'Untitled trend' : 'Untitled funnel';

  const [name, setName] = useState(isNew ? defaultName : '');
  const [funnelConfig, setFunnelConfig] = useState<FunnelWidgetConfig>(defaultFunnelConfig);
  const [trendConfig, setTrendConfig] = useState<TrendWidgetConfig>(defaultTrendConfig);
  const initialized = useRef(isNew);

  useEffect(() => {
    if (!initialized.current && sourceWidget) {
      setName(sourceWidget.name);
      if (sourceWidget.type === 'funnel') {
        setFunnelConfig(sourceWidget.config as FunnelWidgetConfig);
      } else if (sourceWidget.type === 'trend') {
        setTrendConfig(sourceWidget.config as TrendWidgetConfig);
      }
      initialized.current = true;
    }
  }, [sourceWidget?.id]);

  const addWidgetMutation = useAddWidget();
  const updateWidgetMutation = useUpdateWidget();
  const isSaving = addWidgetMutation.isPending || updateWidgetMutation.isPending;
  const [saveError, setSaveError] = useState<string | null>(null);

  const dashboardPath = `/dashboards/${dashboardId}${projectId ? `?project=${projectId}` : ''}`;

  // --- Funnel-specific ---
  const previewId = isNew ? 'preview' : widgetId!;
  const funnelQuery = useFunnelData(funnelConfig, previewId);
  const funnelSteps = funnelQuery.data?.data.steps;
  const funnelBreakdown = funnelQuery.data?.data.breakdown;
  const isFunnelConfigValid =
    funnelConfig.steps.length >= 2 && funnelConfig.steps.every((s) => s.event_name.trim() !== '');
  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(funnelQuery.data?.data);

  // --- Trend-specific ---
  const trendQuery = useTrendData(trendConfig, previewId);
  const trendResult = trendQuery.data?.data;
  const trendSeries = trendResult?.series;
  const isTrendConfigValid =
    trendConfig.series.length >= 1 && trendConfig.series.every((s) => s.event_name.trim() !== '');
  const trendTotal = trendSeries?.reduce(
    (acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0),
    0,
  ) ?? 0;
  const trendMetricLabel = METRIC_OPTIONS.find((o) => o.value === trendConfig.metric)?.label ?? trendConfig.metric;

  // --- Common ---
  const isConfigValid = resolvedType === 'funnel' ? isFunnelConfigValid : isTrendConfigValid;
  const hasData = resolvedType === 'funnel' ? !!funnelQuery.data : !!trendQuery.data;
  const isDataLoading = (resolvedType === 'funnel' ? funnelQuery.isLoading : trendQuery.isLoading) && !hasData;
  const isDataFetching = resolvedType === 'funnel' ? funnelQuery.isFetching : trendQuery.isFetching;
  const isValid = name.trim() !== '' && isConfigValid;

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setSaveError(null);

    let cleanConfig: FunnelWidgetConfig | TrendWidgetConfig;
    if (resolvedType === 'funnel') {
      cleanConfig = {
        ...funnelConfig,
        steps: funnelConfig.steps.map((s) => ({
          ...s,
          filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
        })),
      };
    } else {
      cleanConfig = {
        ...trendConfig,
        series: trendConfig.series.map((s) => ({
          ...s,
          filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
        })),
      };
    }

    try {
      if (isNew) {
        const maxY = store.localLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
        const layout = { x: 0, y: maxY, w: 6, h: 4 };
        const created = await addWidgetMutation.mutateAsync({
          dashboardId: dashboardId!,
          widget: { type: resolvedType, name, config: cleanConfig, layout },
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

  const TypeIcon = resolvedType === 'trend' ? TrendingUp : GitFork;
  const typeLabel = resolvedType === 'trend' ? 'Trend' : 'Funnel';
  const placeholder = resolvedType === 'trend' ? 'Untitled trend' : 'Untitled funnel';

  return (
    <div className="-m-6 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-background px-5 h-14 flex-shrink-0">
        <Link
          to={dashboardPath}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="max-w-[140px] truncate">{dashboard?.name ?? '\u2026'}</span>
        </Link>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
          <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{typeLabel}</span>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/40 min-w-0"
        />

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

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel */}
        {resolvedType === 'funnel' && (
          <FunnelQueryPanel config={funnelConfig} onChange={setFunnelConfig} />
        )}
        {resolvedType === 'trend' && (
          <TrendQueryPanel config={trendConfig} onChange={setTrendConfig} />
        )}

        {/* Right panel */}
        <main className="flex-1 overflow-auto flex flex-col">

          {/* Not configured */}
          {!isConfigValid && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                {resolvedType === 'funnel' ? (
                  <TrendingDown className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <BarChart3 className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {resolvedType === 'funnel' ? 'Configure your funnel' : 'Configure your trend'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resolvedType === 'funnel'
                    ? 'Add at least 2 steps with event names to see results'
                    : 'Add at least 1 series with an event name to see results'}
                </p>
              </div>
            </div>
          )}

          {/* Loading */}
          {isConfigValid && isDataLoading && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              <div className="flex gap-8">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              {resolvedType === 'funnel' ? (
                <div className="space-y-3 max-w-2xl">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-[75%]" />
                  <Skeleton className="h-10 w-[55%]" />
                  <Skeleton className="h-10 w-[35%]" />
                </div>
              ) : (
                <Skeleton className="h-[300px] w-full" />
              )}
            </div>
          )}

          {/* ── Funnel results ── */}
          {resolvedType === 'funnel' && isConfigValid && !isDataLoading && (
            <>
              {(!funnelSteps || funnelSteps.length === 0) ? (
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
              ) : (
                <div className={`flex flex-col h-full transition-opacity ${isDataFetching ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                    <Metric label="Overall conversion" value={`${overallConversion}%`} accent />
                    <div className="w-px h-8 bg-border/50 mx-6" />
                    <Metric label="Entered funnel" value={totalEntered?.toLocaleString() ?? '\u2014'} />
                    <div className="w-px h-8 bg-border/50 mx-6" />
                    <Metric label="Completed" value={totalConverted?.toLocaleString() ?? '\u2014'} />
                  </div>
                  <div className="flex-1 overflow-auto p-6 pt-8">
                    <FunnelChart steps={funnelSteps} breakdown={funnelBreakdown} aggregateSteps={funnelQuery.data?.data.aggregate_steps} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Trend results ── */}
          {resolvedType === 'trend' && isConfigValid && !isDataLoading && (
            <>
              {(!trendSeries || trendSeries.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <TrendingUp className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No results found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      No events match these series in the selected date range
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`flex flex-col h-full transition-opacity ${isDataFetching ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                    <Metric label={trendMetricLabel} value={trendTotal.toLocaleString()} accent />
                    <div className="w-px h-8 bg-border/50 mx-6" />
                    <Metric label="Series" value={String(trendSeries.length)} />
                    {trendResult?.compare && trendResult.series_previous && (
                      <>
                        <div className="w-px h-8 bg-border/50 mx-6" />
                        <Metric
                          label="Previous period"
                          value={trendResult.series_previous
                            .reduce((acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0), 0)
                            .toLocaleString()}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto p-6 pt-8">
                    <TrendChart
                      series={trendSeries}
                      previousSeries={trendResult?.series_previous}
                      chartType={trendConfig.chart_type}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
