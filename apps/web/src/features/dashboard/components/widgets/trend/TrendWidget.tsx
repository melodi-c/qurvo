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
import type { Widget, TrendWidgetConfig, TrendAggregateResult, TrendResult } from '@/api/generated/Api';

/** Common response shape for WidgetShell — only cached_at/from_cache are read. */
interface CachedShellResponse {
  cached_at: string;
  from_cache: boolean;
}

interface TrendWidgetProps {
  widget: Widget;
}

/** Check if all series have valid (non-empty) event names. */
function hasValidConfig(config: TrendWidgetConfig | undefined): boolean {
  return !!config && config.series.length >= 1 && config.series.every((s) => s.event_name.trim() !== '');
}

/** Check if aggregate result has any data rows. */
function isAggregateEmpty(result: TrendAggregateResult | undefined): boolean {
  if (!result) {return true;}
  return !result.heatmap?.length && !result.world_map?.length;
}

/** Check if trend result has any series. */
function isTrendEmpty(result: TrendResult | undefined): boolean {
  return !result || result.series.length === 0;
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
  const shellQuery: WidgetDataResult<CachedShellResponse> = useMemo(() => {
    const src = isCustomQuery ? aggregateQuery : query;
    return {
      data: src.data ? { cached_at: src.data.cached_at, from_cache: src.data.from_cache } : undefined,
      isLoading: src.isLoading,
      isFetching: src.isFetching,
      isPlaceholderData: src.isPlaceholderData,
      error: src.error,
      refresh: src.refresh as () => Promise<CachedShellResponse | undefined>,
    };
  }, [isCustomQuery, aggregateQuery, query]);

  const totals = result?.series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)) ?? [];
  const mainTotal = totals[0] ?? 0;

  const isEmpty = isCustomQuery ? isAggregateEmpty(aggregateResult) : isTrendEmpty(result);

  const handleExportCsv = useCallback(() => {
    if (!result?.series) {return;}
    downloadCsv(trendToCsv(result.series), 'trend.csv');
  }, [result]);

  return (
    <WidgetShell
      query={shellQuery}
      isConfigValid={hasValidConfig(config)}
      configureMessage={hasConfig ? t('configureSeries') : t('noInsight')}
      isEditing={isEditing}
      isEmpty={isEmpty}
      emptyMessage={t('noEvents')}
      emptyHint={t('adjustRange')}
      metric={!isCustomQuery ? <span className="text-xl font-bold tabular-nums text-primary">{mainTotal.toLocaleString()}</span> : undefined}
      metricSecondary={!isCustomQuery && totals.length > 1 ? (
        <span className="text-xs text-muted-foreground tabular-nums truncate">
          {totals.slice(1).map((v) => v.toLocaleString()).join(' / ')}
        </span>
      ) : undefined}
      cachedAt={shellQuery.data?.cached_at}
      fromCache={shellQuery.data?.from_cache}
      onExportCsv={!isCustomQuery && result?.series ? handleExportCsv : undefined}
    >
      {!isEmpty && (
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
          heatmapData={aggregateResult?.heatmap}
          dateFrom={config!.date_from}
          dateTo={config!.date_to}
        />
      )}
    </WidgetShell>
  );
}
