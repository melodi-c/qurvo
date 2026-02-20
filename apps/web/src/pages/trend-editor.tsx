import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Save, BarChart3, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInsight, useCreateInsight, useUpdateInsight } from '@/features/insights/hooks/use-insights';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { TrendQueryPanel } from '@/features/dashboard/components/widgets/trend/TrendQueryPanel';
import { defaultTrendConfig, METRIC_OPTIONS } from '@/features/dashboard/components/widgets/trend/trend-shared';
import { Metric } from '@/features/dashboard/components/widgets/funnel/funnel-shared';
import type { TrendWidgetConfig } from '@/api/generated/Api';

export default function TrendEditorPage() {
  const { insightId } = useParams<{ insightId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  const isNew = !insightId;
  const { data: insight } = useInsight(insightId ?? '');

  const [name, setName] = useState('Untitled trend');
  const [config, setConfig] = useState<TrendWidgetConfig>(defaultTrendConfig);
  const initialized = useRef(isNew);

  useEffect(() => {
    if (!initialized.current && insight) {
      setName(insight.name);
      setConfig(insight.config as TrendWidgetConfig);
      initialized.current = true;
    }
  }, [insight]);

  const createMutation = useCreateInsight();
  const updateMutation = useUpdateInsight();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const [saveError, setSaveError] = useState<string | null>(null);

  const listPath = `/trends?project=${projectId}`;

  // Trend data
  const isConfigValid =
    config.series.length >= 1 && config.series.every((s) => s.event_name.trim() !== '');
  const previewId = isNew ? 'trend-new' : insightId!;
  const { data, isLoading, isFetching } = useTrendData(config, previewId);
  const result = data?.data;
  const series = result?.series;
  const showSkeleton = isLoading && !data;

  const totalValue = series?.reduce(
    (acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0),
    0,
  ) ?? 0;
  const seriesCount = series?.length ?? 0;
  const metricLabel = METRIC_OPTIONS.find((o) => o.value === config.metric)?.label ?? config.metric;

  const isValid = name.trim() !== '' && isConfigValid;

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setSaveError(null);

    const cleanConfig: TrendWidgetConfig = {
      ...config,
      series: config.series.map((s) => ({
        ...s,
        filters: (s.filters ?? []).filter((f) => f.property.trim() !== ''),
      })),
    };

    try {
      if (isNew) {
        await createMutation.mutateAsync({
          type: 'trend',
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
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-background px-5 h-14 flex-shrink-0">
        <Link
          to={listPath}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Trends</span>
        </Link>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Untitled trend"
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
            <Link to={listPath}>Discard</Link>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isValid || isSaving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? 'Saving\u2026' : 'Save'}
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <TrendQueryPanel config={config} onChange={setConfig} />

        <main className="flex-1 overflow-auto flex flex-col">
          {/* Not configured */}
          {!isConfigValid && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BarChart3 className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Configure your trend</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add at least 1 series with an event name to see results
                </p>
              </div>
            </div>
          )}

          {/* Loading */}
          {isConfigValid && showSkeleton && (
            <div className="flex-1 flex flex-col gap-6 p-8">
              <div className="flex gap-8">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-28" />
              </div>
              <Skeleton className="h-[300px] w-full" />
            </div>
          )}

          {/* No data */}
          {isConfigValid && !showSkeleton && (!series || series.length === 0) && (
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
          )}

          {/* Results */}
          {isConfigValid && !showSkeleton && series && series.length > 0 && (
            <div className={`flex flex-col h-full transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-0 border-b border-border/60 px-6 py-4 shrink-0">
                <Metric label={metricLabel} value={totalValue.toLocaleString()} accent />
                <div className="w-px h-8 bg-border/50 mx-6" />
                <Metric label="Series" value={String(seriesCount)} />
                {result?.compare && result.series_previous && (
                  <>
                    <div className="w-px h-8 bg-border/50 mx-6" />
                    <Metric
                      label="Previous period"
                      value={result.series_previous
                        .reduce((acc, s) => acc + s.data.reduce((sum, dp) => sum + dp.value, 0), 0)
                        .toLocaleString()}
                    />
                  </>
                )}
              </div>
              <div className="flex-1 overflow-auto p-6 pt-8">
                <TrendChart
                  series={series}
                  previousSeries={result?.series_previous}
                  chartType={config.chart_type}
                  granularity={config.granularity}
                />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
