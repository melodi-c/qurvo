import { useCallback, useMemo } from 'react';
import { WidgetShell } from '../WidgetShell';
import { useDashboardStore } from '@/features/dashboard/store';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { useTrendAggregateData } from '@/features/dashboard/hooks/use-trend-aggregate';
import { useAnnotations } from '@/features/dashboard/hooks/use-annotations';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import type { WidgetDataResult } from '@/features/dashboard/hooks/create-widget-data-hook';
import translations from './TrendWidget.translations';
import { TrendChart } from './TrendChart';
import { defaultTrendConfig, CUSTOM_QUERY_CHART_TYPES } from './trend-shared';
import { trendToCsv, downloadCsv } from '@/lib/csv-export';
import type { Widget, TrendWidgetConfig } from '@/api/generated/Api';

/** Minimal cached response shape that WidgetShell needs from the query.data field. */
interface CachedEnvelope {
  cached_at: string;
  from_cache: boolean;
}

interface TrendWidgetProps {
  widget: Widget;
}

export function TrendWidget({ widget }: TrendWidgetProps) {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const { t } = useLocalTranslation(translations);

  const config = widget.insight?.config as TrendWidgetConfig | undefined;
  const hasConfig = !!config;
  const effectiveConfig = config ?? defaultTrendConfig(t('seriesLabel'));
  const isCustomQuery = CUSTOM_QUERY_CHART_TYPES.includes(effectiveConfig.chart_type);

  const query = useTrendData(effectiveConfig, widget.id);
  const aggregateQuery = useTrendAggregateData(effectiveConfig, widget.id);
  const result = query.data?.data;
  const aggregateResult = aggregateQuery.data?.data;
  const { data: annotations } = useAnnotations(config?.date_from, config?.date_to);

  // Build a unified query view so WidgetShell doesn't need to know about the union type.
  const shellQuery: WidgetDataResult<CachedEnvelope> = useMemo(() => {
    const src = isCustomQuery ? aggregateQuery : query;
    return {
      data: src.data ? { cached_at: src.data.cached_at, from_cache: src.data.from_cache } : undefined,
      isLoading: src.isLoading,
      isFetching: src.isFetching,
      isPlaceholderData: src.isPlaceholderData,
      error: src.error,
      refresh: src.refresh as () => Promise<CachedEnvelope | undefined>,
    };
  }, [isCustomQuery, aggregateQuery, query]);

  const hasValidSeries = hasConfig && config.series.length >= 1 && config.series.every((s) => s.event_name.trim() !== '');
  const totals = result?.series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)) ?? [];
  const mainTotal = totals[0] ?? 0;

  const hasData = isCustomQuery
    ? !!aggregateResult
    : !!result && result.series.length > 0;

  const handleExportCsv = useCallback(() => {
    if (!result?.series) {return;}
    downloadCsv(trendToCsv(result.series), 'trend.csv');
  }, [result]);

  return (
    <WidgetShell
      query={shellQuery}
      isConfigValid={hasValidSeries}
      configureMessage={hasConfig ? t('configureSeries') : t('noInsight')}
      isEditing={isEditing}
      isEmpty={!hasData}
      emptyMessage={t('noEvents')}
      emptyHint={t('adjustRange')}
      metric={!isCustomQuery ? <span className="text-xl font-bold tabular-nums text-primary">{mainTotal.toLocaleString()}</span> : undefined}
      metricSecondary={!isCustomQuery && totals.length > 1 ? (
        <span className="text-xs text-muted-foreground tabular-nums truncate">
          {totals.slice(1).map((t) => t.toLocaleString()).join(' / ')}
        </span>
      ) : undefined}
      cachedAt={shellQuery.data?.cached_at}
      fromCache={shellQuery.data?.from_cache}
      onExportCsv={!isCustomQuery && result?.series ? handleExportCsv : undefined}
    >
      {hasData && (
        <TrendChart
          series={result?.series ?? []}
          previousSeries={result?.series_previous}
          chartType={config!.chart_type}
          granularity={config!.granularity}
          compact
          formulas={config!.formulas}
          annotations={annotations}
          seriesConfig={config!.series}
          aggregateData={aggregateResult}
        />
      )}
    </WidgetShell>
  );
}
