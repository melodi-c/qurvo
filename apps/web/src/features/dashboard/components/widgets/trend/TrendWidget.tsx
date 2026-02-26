import { useCallback } from 'react';
import { WidgetShell } from '../WidgetShell';
import { useDashboardStore } from '@/features/dashboard/store';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { useAnnotations } from '@/features/dashboard/hooks/use-annotations';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendWidget.translations';
import { TrendChart } from './TrendChart';
import { defaultTrendConfig } from './trend-shared';
import { trendToCsv, downloadCsv } from '@/lib/csv-export';
import type { Widget, TrendWidgetConfig } from '@/api/generated/Api';

interface TrendWidgetProps {
  widget: Widget;
}

export function TrendWidget({ widget }: TrendWidgetProps) {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const { t } = useLocalTranslation(translations);

  const config = widget.insight?.config as TrendWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useTrendData(config ?? defaultTrendConfig(t('seriesLabel')), widget.id);
  const result = query.data?.data;
  const { data: annotations } = useAnnotations(config?.date_from, config?.date_to);

  const hasValidSeries = hasConfig && config.series.length >= 1 && config.series.every((s) => s.event_name.trim() !== '');
  const totals = result?.series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)) ?? [];
  const mainTotal = totals[0] ?? 0;

  const handleExportCsv = useCallback(() => {
    if (!result?.series) return;
    downloadCsv(trendToCsv(result.series), 'trend.csv');
  }, [result]);

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasValidSeries}
      configureMessage={hasConfig ? t('configureSeries') : t('noInsight')}
      isEditing={isEditing}
      isEmpty={!result || result.series.length === 0}
      emptyMessage={t('noEvents')}
      emptyHint={t('adjustRange')}
      metric={<span className="text-xl font-bold tabular-nums text-primary">{mainTotal.toLocaleString()}</span>}
      metricSecondary={totals.length > 1 ? (
        <span className="text-xs text-muted-foreground tabular-nums truncate">
          {totals.slice(1).map((t) => t.toLocaleString()).join(' / ')}
        </span>
      ) : undefined}
      cachedAt={query.data?.cached_at}
      fromCache={query.data?.from_cache}
      onExportCsv={result?.series ? handleExportCsv : undefined}
    >
      {result && (
        <TrendChart
          series={result.series}
          previousSeries={result.series_previous}
          chartType={config!.chart_type}
          granularity={config!.granularity}
          compact
          formulas={config!.formulas}
          annotations={annotations}
        />
      )}
    </WidgetShell>
  );
}
