import { useCallback } from 'react';
import { WidgetShell } from '../WidgetShell';
import { useDashboardStore } from '@/features/dashboard/store';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { useTrendAggregateData } from '@/features/dashboard/hooks/use-trend-aggregate';
import { useAnnotations } from '@/features/dashboard/hooks/use-annotations';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendWidget.translations';
import { TrendChart } from './TrendChart';
import { defaultTrendConfig, CUSTOM_QUERY_CHART_TYPES } from './trend-shared';
import { trendToCsv, downloadCsv } from '@/lib/csv-export';
import type { Widget, TrendWidgetConfig, TrendAggregateResult, TrendResult } from '@/api/generated/Api';

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
  const chartType = config?.chart_type ?? 'line';
  const isCustomQuery = CUSTOM_QUERY_CHART_TYPES.includes(chartType);
  const defaultConfig = defaultTrendConfig(t('seriesLabel'));

  // Both hooks are always called (React rules), but only the relevant one is enabled.
  // For custom-query types (world_map, calendar_heatmap), useTrendData passes empty series
  // so it stays disabled, and vice-versa for useTrendAggregateData.
  const trendQuery = useTrendData(
    isCustomQuery ? { ...defaultConfig, chart_type: 'line' } : (config ?? defaultConfig),
    widget.id,
  );
  const aggregateQuery = useTrendAggregateData(
    isCustomQuery ? (config ?? defaultConfig) : { ...defaultConfig, series: [] },
    widget.id,
  );

  const query = isCustomQuery ? aggregateQuery : trendQuery;
  const trendResult = trendQuery.data?.data;
  const aggregateResult = aggregateQuery.data?.data;

  const { data: annotations } = useAnnotations(config?.date_from, config?.date_to);

  const totals = trendResult?.series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)) ?? [];
  const mainTotal = totals[0] ?? 0;

  const handleExportCsv = useCallback(() => {
    if (!trendResult?.series) {return;}
    downloadCsv(trendToCsv(trendResult.series), 'trend.csv');
  }, [trendResult]);

  const isEmpty = isCustomQuery ? isAggregateEmpty(aggregateResult) : isTrendEmpty(trendResult);
  const hasData = trendResult || aggregateResult;

  return (
    <WidgetShell
      query={query}
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
      cachedAt={query.data?.cached_at}
      fromCache={query.data?.from_cache}
      onExportCsv={!isCustomQuery && trendResult?.series ? handleExportCsv : undefined}
    >
      {hasData && (
        <TrendChart
          series={trendResult?.series ?? []}
          previousSeries={trendResult?.series_previous}
          chartType={config!.chart_type}
          granularity={config!.granularity}
          compact
          formulas={config!.formulas}
          annotations={annotations}
          seriesConfig={config!.series}
          heatmapData={aggregateResult?.heatmap}
        />
      )}
    </WidgetShell>
  );
}
