import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { LayoutDashboard, LinkIcon, FileQuestion } from 'lucide-react';
import { apiClient } from '@/api/client';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useElementWidth } from '@/hooks/use-element-width';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { formatCompactNumber } from '@/lib/formatting';
import { pluralize } from '@/i18n/pluralize';
import { InsightTypeIcon } from '@/features/insights/components/InsightTypeIcon';
import { WidgetShell } from '@/features/dashboard/components/widgets/WidgetShell';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { CUSTOM_QUERY_CHART_TYPES } from '@/features/dashboard/components/widgets/trend/trend-shared';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { getFunnelMetrics } from '@/features/dashboard/components/widgets/funnel/funnel-utils';
import { RetentionTable } from '@/features/dashboard/components/widgets/retention/RetentionTable';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';
import { PathsChart } from '@/features/dashboard/components/widgets/paths/PathsChart';
import type { WidgetDataResult } from '@/features/dashboard/hooks/create-widget-data-hook';
import type {
  Widget,

  TrendWidgetConfig,
  TrendResult,
  TrendAggregateResult,
  FunnelWidgetConfig,
  FunnelResult,
  RetentionResult,
  LifecycleResult,
  StickinessResult,
  PathsResult,
} from '@/api/generated/Api';
import translations from './public-dashboard.translations';

// ---------------------------------------------------------------------------
// Grid layout constants — mirror DashboardGrid
// ---------------------------------------------------------------------------
const BREAKPOINTS = { sm: 1024, xs: 0 };
const COLS = { sm: 24, xs: 1 };
const GRID_ROW_HEIGHT = 40;
const GRID_MARGIN: [number, number] = [12, 12];
const GRID_CONTAINER_PADDING: [number, number] = [0, 0];

// ---------------------------------------------------------------------------
// Fake query helper — bridges precomputed data into WidgetShell interface
// ---------------------------------------------------------------------------
function makeFakeQuery<T>(data: T | null | undefined): WidgetDataResult<T> {
  return {
    data: data ?? undefined,
    isLoading: false,
    isFetching: false,
    isPlaceholderData: false,
    error: data === null ? new Error('unavailable') : null,
    refresh: async () => data ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Per-widget-type precomputed data envelope
// ---------------------------------------------------------------------------
interface PrecomputedData {
  data: unknown;
  cached_at: string;
  from_cache: boolean;
}

function getPrecomputed(
  widgetData: Record<string, PrecomputedData | null> | undefined,
  widgetId: string,
): PrecomputedData | null {
  return widgetData?.[widgetId] ?? null;
}

// ---------------------------------------------------------------------------
// Widget mobile height — same logic as DashboardGrid
// ---------------------------------------------------------------------------
function getWidgetMobileHeight(widget: Widget): number {
  if (widget.insight?.type === 'retention') {return 440;}
  if (!widget.insight) {return 200;}
  return 320;
}

// ---------------------------------------------------------------------------
// PublicWidgetHeader — type badge + title, no menu
// ---------------------------------------------------------------------------
function PublicWidgetHeader({ widget }: { widget: Widget }) {
  const { t } = useLocalTranslation(translations);

  if (!widget.insight) {
    return (
      <div className="flex items-center gap-2 px-3 pt-3 pb-1 flex-shrink-0">
        <span className="text-xs font-medium text-muted-foreground">{t('textWidget')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1 flex-shrink-0 min-w-0">
      <InsightTypeIcon type={widget.insight.type} className="h-3.5 w-3.5" />
      <span className="font-medium text-sm truncate">{widget.insight.name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-type visualization components
// ---------------------------------------------------------------------------

function PublicTrendViz({ widget, precomputed }: { widget: Widget; precomputed: PrecomputedData | null }) {
  const { t } = useLocalTranslation(translations);
  const config = widget.insight?.config as TrendWidgetConfig | undefined;

  if (!config) {return null;}

  const isCustomQuery = CUSTOM_QUERY_CHART_TYPES.includes(config.chart_type);

  // For aggregate chart types, the backend wraps data with { _aggregate: true, ...TrendAggregateResult }
  const rawData = precomputed?.data as Record<string, unknown> | null;
  const isAggregate = rawData !== null && '_aggregate' in rawData && rawData._aggregate === true;

  const trendResult: TrendResult | null = !isAggregate ? (rawData as TrendResult | null) : null;
  const aggregateResult: TrendAggregateResult | undefined = isAggregate
    ? (rawData as TrendAggregateResult)
    : undefined;

  const query = makeFakeQuery(precomputed ? { cached_at: precomputed.cached_at, from_cache: precomputed.from_cache } : null);

  const totals = trendResult?.series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)) ?? [];
  const mainTotal = totals[0] ?? 0;

  const isEmpty = isCustomQuery
    ? !aggregateResult || (!aggregateResult.heatmap?.length && !aggregateResult.world_map?.length)
    : !trendResult || trendResult.series.length === 0;

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={isEmpty}
      emptyMessage={t('noData')}
      metric={
        !isCustomQuery ? (
          <span className="text-xl font-bold tabular-nums text-primary">{mainTotal.toLocaleString()}</span>
        ) : undefined
      }
      metricSecondary={
        !isCustomQuery && totals.length > 1 ? (
          <span className="text-xs text-muted-foreground tabular-nums truncate">
            {totals.slice(1).map((v) => v.toLocaleString()).join(' / ')}
          </span>
        ) : undefined
      }
      cachedAt={precomputed?.cached_at}
      fromCache={precomputed?.from_cache}
    >
      {!isEmpty && (
        <TrendChart
          series={trendResult?.series ?? []}
          previousSeries={trendResult?.series_previous}
          chartType={config.chart_type}
          granularity={config.granularity}
          compact
          formulas={config.formulas}
          aggregateData={aggregateResult}
          heatmapData={aggregateResult?.heatmap}
        />
      )}
    </WidgetShell>
  );
}

function PublicFunnelViz({ widget, precomputed }: { widget: Widget; precomputed: PrecomputedData | null }) {
  const { t } = useLocalTranslation(translations);
  const config = widget.insight?.config as FunnelWidgetConfig | undefined;

  const result = precomputed?.data as FunnelResult | null;
  const query = makeFakeQuery(precomputed ? { cached_at: precomputed.cached_at, from_cache: precomputed.from_cache } : null);

  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(result ?? undefined);

  return (
    <WidgetShell
      query={query}
      isConfigValid={!!config}
      isEmpty={!result || result.steps.length === 0}
      emptyMessage={t('noData')}
      metric={
        <span className="text-xl font-bold tabular-nums text-primary">
          {overallConversion !== null ? `${overallConversion}%` : '\u2014'}
        </span>
      }
      metricSecondary={
        <span className="text-xs text-muted-foreground tabular-nums truncate">
          {totalEntered?.toLocaleString()} &rarr; {totalConverted?.toLocaleString()}
        </span>
      }
      cachedAt={precomputed?.cached_at}
      fromCache={precomputed?.from_cache}
    >
      {result && (
        <div className="h-full overflow-auto">
          <FunnelChart
            steps={result.steps}
            breakdown={result.breakdown}
            aggregateSteps={result.aggregate_steps}
            compact
            conversionRateDisplay={config?.conversion_rate_display ?? 'total'}
          />
        </div>
      )}
    </WidgetShell>
  );
}

function PublicRetentionViz({ precomputed }: { precomputed: PrecomputedData | null }) {
  const { t } = useLocalTranslation(translations);

  const result = precomputed?.data as RetentionResult | null;
  const query = makeFakeQuery(precomputed ? { cached_at: precomputed.cached_at, from_cache: precomputed.from_cache } : null);

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.cohorts.length === 0}
      emptyMessage={t('noData')}
      skeletonVariant="table"
      metric={
        <span className="text-xl font-bold tabular-nums text-primary">
          {result?.cohorts.length ?? 0}
        </span>
      }
      metricSecondary={<span className="text-xs text-muted-foreground">{t('cohorts')}</span>}
      cachedAt={precomputed?.cached_at}
      fromCache={precomputed?.from_cache}
    >
      {result && (
        <div className="h-full overflow-x-auto">
          <RetentionTable result={result} compact />
        </div>
      )}
    </WidgetShell>
  );
}

function PublicLifecycleViz({ precomputed }: { precomputed: PrecomputedData | null }) {
  const { t, lang } = useLocalTranslation(translations);

  const result = precomputed?.data as LifecycleResult | null;
  const query = makeFakeQuery(precomputed ? { cached_at: precomputed.cached_at, from_cache: precomputed.from_cache } : null);

  const activeUsers = result
    ? result.totals.new + result.totals.returning + result.totals.resurrecting
    : 0;

  const activeUsersLabel = pluralize(
    activeUsers,
    { one: t('activeUsersOne'), few: t('activeUsersFew'), many: t('activeUsersMany') },
    lang,
  );

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.data.length === 0}
      emptyMessage={t('noData')}
      metric={
        <span className="text-xl font-bold tabular-nums text-primary">
          {formatCompactNumber(activeUsers)}
        </span>
      }
      metricSecondary={<span className="text-xs text-muted-foreground">{activeUsersLabel}</span>}
      cachedAt={precomputed?.cached_at}
      fromCache={precomputed?.from_cache}
    >
      {result && <LifecycleChart result={result} compact />}
    </WidgetShell>
  );
}

function PublicStickinessViz({ precomputed }: { precomputed: PrecomputedData | null }) {
  const { t, lang } = useLocalTranslation(translations);

  const result = precomputed?.data as StickinessResult | null;
  const query = makeFakeQuery(precomputed ? { cached_at: precomputed.cached_at, from_cache: precomputed.from_cache } : null);

  const totalUsers = result?.data.reduce((sum, d) => sum + d.user_count, 0) ?? 0;

  const totalUsersLabel = pluralize(
    totalUsers,
    { one: t('totalUsersOne'), few: t('totalUsersFew'), many: t('totalUsersMany') },
    lang,
  );

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.data.length === 0}
      emptyMessage={t('noData')}
      metric={
        <span className="text-xl font-bold tabular-nums text-primary">
          {formatCompactNumber(totalUsers)}
        </span>
      }
      metricSecondary={<span className="text-xs text-muted-foreground">{totalUsersLabel}</span>}
      cachedAt={precomputed?.cached_at}
      fromCache={precomputed?.from_cache}
    >
      {result && <StickinessChart result={result} compact />}
    </WidgetShell>
  );
}

function PublicPathsViz({ precomputed }: { precomputed: PrecomputedData | null }) {
  const { t } = useLocalTranslation(translations);

  const result = precomputed?.data as PathsResult | null;
  const query = makeFakeQuery(precomputed ? { cached_at: precomputed.cached_at, from_cache: precomputed.from_cache } : null);

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.transitions.length === 0}
      emptyMessage={t('noData')}
      skeletonVariant="flow"
      metric={
        <span className="text-xl font-bold tabular-nums text-primary">
          {result?.transitions.length ?? 0}
        </span>
      }
      metricSecondary={<span className="text-xs text-muted-foreground">{t('transitions')}</span>}
      cachedAt={precomputed?.cached_at}
      fromCache={precomputed?.from_cache}
    >
      {result && <PathsChart transitions={result.transitions} topPaths={result.top_paths} compact />}
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// PublicWidgetViz — dispatcher by insight type
// ---------------------------------------------------------------------------
function PublicWidgetViz({ widget, precomputed }: { widget: Widget; precomputed: PrecomputedData | null }) {
  const { t } = useLocalTranslation(translations);

  if (!widget.insight) {return null;}

  // Widget data failed or unavailable
  if (!precomputed) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">{t('widgetUnavailable')}</p>
      </div>
    );
  }

  switch (widget.insight.type) {
    case 'trend':
      return <PublicTrendViz widget={widget} precomputed={precomputed} />;
    case 'funnel':
      return <PublicFunnelViz widget={widget} precomputed={precomputed} />;
    case 'retention':
      return <PublicRetentionViz precomputed={precomputed} />;
    case 'lifecycle':
      return <PublicLifecycleViz precomputed={precomputed} />;
    case 'stickiness':
      return <PublicStickinessViz precomputed={precomputed} />;
    case 'paths':
      return <PublicPathsViz precomputed={precomputed} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// PublicWidgetCard — single card in the grid
// ---------------------------------------------------------------------------
function PublicWidgetCard({
  widget,
  precomputed,
}: {
  widget: Widget;
  precomputed: PrecomputedData | null;
}) {
  // Text tile widget
  if (!widget.insight && widget.content) {
    return (
      <div className="h-full flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <PublicWidgetHeader widget={widget} />
        <div className="flex-1 p-3 min-h-0 overflow-auto text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {widget.content}
        </div>
      </div>
    );
  }

  // Insight widget — render with real chart
  if (widget.insight) {
    return (
      <div className="h-full flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <PublicWidgetHeader widget={widget} />
        <div className="flex-1 p-3 min-h-0 overflow-hidden">
          <PublicWidgetViz widget={widget} precomputed={precomputed} />
        </div>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// PublicDashboardPage — main page component
// ---------------------------------------------------------------------------
export default function PublicDashboardPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { t } = useLocalTranslation(translations);
  const { ref: containerRef, width } = useElementWidth();
  const isMobile = useIsMobile();

  const { data: dashboard, isLoading, isError, error } = useQuery({
    queryKey: ['public-dashboard', shareToken],
    queryFn: () => apiClient.api.publicControllerGetPublicDashboard({ shareToken: shareToken! }),
    enabled: Boolean(shareToken),
    retry: false,
  });

  const is404 = isError && error instanceof AxiosError && error.response?.status === 404;

  // Build grid layouts from widget.layout data
  const { smLayout, xsLayout } = useMemo(() => {
    if (!dashboard?.widgets) {return { smLayout: [], xsLayout: [] };}

    const sm = dashboard.widgets.map((w) => ({
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
    }));

    const xs = sm.map((l) => ({
      ...l,
      x: 0,
      w: 1,
    }));

    return { smLayout: sm, xsLayout: xs };
  }, [dashboard?.widgets]);

  return (
    <div className="min-h-screen bg-background">
      {/* Public header bar */}
      <header className="sticky top-0 z-10 bg-sidebar border-b border-border px-4 lg:px-6 h-12 flex items-center gap-3">
        <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-semibold text-sm truncate flex-1">
          {isLoading ? <Skeleton className="h-4 w-40" /> : (dashboard?.name ?? '')}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{t('poweredBy')}</span>
      </header>

      <main className="p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Loading skeleton with grid-like layout */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Error states */}
        {!isLoading && isError && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <EmptyState
              icon={is404 ? FileQuestion : LinkIcon}
              title={is404 ? t('notFound') : t('expired')}
              description={is404 ? t('notFoundDescription') : t('expiredDescription')}
            />
          </div>
        )}

        {/* Dashboard loaded */}
        {!isLoading && dashboard && (
          <>
            {dashboard.widgets.length === 0 && (
              <div className="flex items-center justify-center min-h-[60vh]">
                <EmptyState
                  icon={LayoutDashboard}
                  description={t('noWidgets')}
                />
              </div>
            )}

            {dashboard.widgets.length > 0 && (
              <>
                {isMobile ? (
                  <div className="flex flex-col gap-3">
                    {dashboard.widgets.map((widget) => (
                      <div key={widget.id} style={{ minHeight: getWidgetMobileHeight(widget) }}>
                        <PublicWidgetCard
                          widget={widget}
                          precomputed={getPrecomputed(dashboard.widget_data, widget.id)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div ref={containerRef}>
                    {width > 0 && (
                      <ResponsiveGridLayout
                        layouts={{ sm: smLayout, xs: xsLayout }}
                        breakpoints={BREAKPOINTS}
                        cols={COLS}
                        rowHeight={GRID_ROW_HEIGHT}
                        margin={GRID_MARGIN}
                        containerPadding={GRID_CONTAINER_PADDING}
                        width={width}
                        dragConfig={{ enabled: false }}
                        resizeConfig={{ enabled: false }}
                      >
                        {dashboard.widgets.map((widget) => (
                          <div key={widget.id}>
                            <PublicWidgetCard
                              widget={widget}
                              precomputed={getPrecomputed(dashboard.widget_data, widget.id)}
                            />
                          </div>
                        ))}
                      </ResponsiveGridLayout>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
