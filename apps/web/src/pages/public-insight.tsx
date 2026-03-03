import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, LinkIcon, FileQuestion } from 'lucide-react';
import { apiClient } from '@/api/client';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { formatDate } from '@/lib/formatting';
import { WidgetShell } from '@/features/dashboard/components/widgets/WidgetShell';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { CUSTOM_QUERY_CHART_TYPES } from '@/features/dashboard/components/widgets/trend/trend-shared';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { RetentionTable } from '@/features/dashboard/components/widgets/retention/RetentionTable';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';
import { PathsChart } from '@/features/dashboard/components/widgets/paths/PathsChart';
import type { WidgetDataResult } from '@/features/dashboard/hooks/create-widget-data-hook';
import type {
  InsightType,
  PublicInsightWithData,
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
import translations from './public-insight.translations';

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
// Precomputed data envelope
// ---------------------------------------------------------------------------
interface PrecomputedData {
  data: unknown;
  cached_at: string;
  from_cache: boolean;
}

// ---------------------------------------------------------------------------
// Per-type visualization components (same as public-dashboard.tsx)
// ---------------------------------------------------------------------------

function InsightTrendViz({ config, precomputed }: { config: TrendWidgetConfig; precomputed: PrecomputedData }) {
  const { t } = useLocalTranslation(translations);
  const isCustomQuery = CUSTOM_QUERY_CHART_TYPES.includes(config.chart_type);

  type AggregateEnvelope = TrendAggregateResult & { _aggregate: true };
  const rawData = precomputed.data as (TrendResult | AggregateEnvelope) | null;
  const isAggregate = rawData !== null && typeof rawData === 'object' && '_aggregate' in rawData;

  const trendResult: TrendResult | null = !isAggregate ? rawData : null;
  const aggregateResult: TrendAggregateResult | undefined = isAggregate ? rawData : undefined;

  const query = makeFakeQuery({ cached_at: precomputed.cached_at, from_cache: precomputed.from_cache });

  const isEmpty = isCustomQuery
    ? !aggregateResult || (!aggregateResult.heatmap?.length && !aggregateResult.world_map?.length)
    : !trendResult || trendResult.series.length === 0;

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={isEmpty}
      emptyMessage={t('noData')}
    >
      {!isEmpty && (
        <TrendChart
          series={trendResult?.series ?? []}
          previousSeries={trendResult?.series_previous}
          chartType={config.chart_type}
          granularity={config.granularity}
          formulas={config.formulas}
          aggregateData={aggregateResult}
          heatmapData={aggregateResult?.heatmap}
          dateFrom={config.date_from}
          dateTo={config.date_to}
        />
      )}
    </WidgetShell>
  );
}

function InsightFunnelViz({ config, precomputed }: { config: FunnelWidgetConfig; precomputed: PrecomputedData }) {
  const { t } = useLocalTranslation(translations);

  const result = precomputed.data as FunnelResult | null;
  const query = makeFakeQuery({ cached_at: precomputed.cached_at, from_cache: precomputed.from_cache });

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.steps.length === 0}
      emptyMessage={t('noData')}
    >
      {result && (
        <div className="h-full overflow-auto">
          <FunnelChart
            steps={result.steps}
            breakdown={result.breakdown}
            aggregateSteps={result.aggregate_steps}
            conversionRateDisplay={config.conversion_rate_display ?? 'total'}
          />
        </div>
      )}
    </WidgetShell>
  );
}

function InsightRetentionViz({ precomputed }: { precomputed: PrecomputedData }) {
  const { t } = useLocalTranslation(translations);

  const result = precomputed.data as RetentionResult | null;
  const query = makeFakeQuery({ cached_at: precomputed.cached_at, from_cache: precomputed.from_cache });

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.cohorts.length === 0}
      emptyMessage={t('noData')}
      skeletonVariant="table"
    >
      {result && (
        <div className="h-full overflow-x-auto">
          <RetentionTable result={result} />
        </div>
      )}
    </WidgetShell>
  );
}

function InsightLifecycleViz({ precomputed }: { precomputed: PrecomputedData }) {
  const { t } = useLocalTranslation(translations);

  const result = precomputed.data as LifecycleResult | null;
  const query = makeFakeQuery({ cached_at: precomputed.cached_at, from_cache: precomputed.from_cache });

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.data.length === 0}
      emptyMessage={t('noData')}
    >
      {result && <LifecycleChart result={result} />}
    </WidgetShell>
  );
}

function InsightStickinessViz({ precomputed }: { precomputed: PrecomputedData }) {
  const { t } = useLocalTranslation(translations);

  const result = precomputed.data as StickinessResult | null;
  const query = makeFakeQuery({ cached_at: precomputed.cached_at, from_cache: precomputed.from_cache });

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.data.length === 0}
      emptyMessage={t('noData')}
    >
      {result && <StickinessChart result={result} />}
    </WidgetShell>
  );
}

function InsightPathsViz({ precomputed }: { precomputed: PrecomputedData }) {
  const { t } = useLocalTranslation(translations);

  const result = precomputed.data as PathsResult | null;
  const query = makeFakeQuery({ cached_at: precomputed.cached_at, from_cache: precomputed.from_cache });

  return (
    <WidgetShell
      query={query}
      isConfigValid
      isEmpty={!result || result.transitions.length === 0}
      emptyMessage={t('noData')}
      skeletonVariant="flow"
    >
      {result && <PathsChart transitions={result.transitions} topPaths={result.top_paths} />}
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Insight visualization dispatcher
// ---------------------------------------------------------------------------
function InsightViz({ insight }: { insight: PublicInsightWithData }) {
  const precomputed: PrecomputedData = {
    data: insight.data,
    cached_at: insight.cached_at,
    from_cache: insight.from_cache,
  };

  switch (insight.type) {
    case 'trend':
      return <InsightTrendViz config={insight.config as TrendWidgetConfig} precomputed={precomputed} />;
    case 'funnel':
      return <InsightFunnelViz config={insight.config as FunnelWidgetConfig} precomputed={precomputed} />;
    case 'retention':
      return <InsightRetentionViz precomputed={precomputed} />;
    case 'lifecycle':
      return <InsightLifecycleViz precomputed={precomputed} />;
    case 'stickiness':
      return <InsightStickinessViz precomputed={precomputed} />;
    case 'paths':
      return <InsightPathsViz precomputed={precomputed} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// PublicInsightPage — main page component
// ---------------------------------------------------------------------------
export default function PublicInsightPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { t } = useLocalTranslation(translations);

  const { data: insight, isLoading, isError, error } = useQuery({
    queryKey: ['public-insight', shareToken],
    queryFn: () => apiClient.api.publicControllerGetPublicInsight({ shareToken: shareToken! }),
    enabled: Boolean(shareToken),
    retry: false,
  });

  const is404 = isError && (error as { status?: number })?.status === 404;

  const typeLabels = useMemo((): Record<InsightType, string> => ({
    trend: t('typeTrend'),
    funnel: t('typeFunnel'),
    retention: t('typeRetention'),
    lifecycle: t('typeLifecycle'),
    stickiness: t('typeStickiness'),
    paths: t('typePaths'),
  }), [t]);

  const typeLabel = insight ? (typeLabels[insight.type] ?? insight.type) : '';

  return (
    <div className="min-h-screen bg-background">
      {/* Public header bar */}
      <header className="sticky top-0 z-10 bg-sidebar border-b border-border px-4 lg:px-6 h-12 flex items-center gap-3">
        <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-semibold text-sm truncate flex-1">
          {isLoading
            ? <Skeleton className="h-4 w-40 inline-block" />
            : (insight?.name ?? '')}
        </span>
        {insight && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {typeLabel}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground shrink-0 ml-2">{t('poweredBy')}</span>
      </header>

      <main className="p-4 lg:p-6 max-w-4xl mx-auto">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {!isLoading && isError && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <EmptyState
              icon={is404 ? FileQuestion : LinkIcon}
              title={is404 ? t('notFound') : t('expired')}
              description={is404 ? t('notFoundDescription') : t('expiredDescription')}
            />
          </div>
        )}

        {!isLoading && insight && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">{insight.name}</h1>
              {insight.description && (
                <p className="text-muted-foreground">{insight.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {t('type')}: <span className="text-foreground">{typeLabel}</span>
                </span>
                <span>{t('updated')}: {formatDate(insight.updated_at)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card min-h-[400px]">
              <InsightViz insight={insight} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
