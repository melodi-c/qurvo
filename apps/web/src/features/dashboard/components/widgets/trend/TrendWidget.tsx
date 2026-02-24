import { WidgetShell } from '../WidgetShell';
import { useDashboardStore } from '@/features/dashboard/store';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendWidget.translations';
import { TrendChart } from './TrendChart';
import type { Widget, TrendWidgetConfig } from '@/api/generated/Api';

interface TrendWidgetProps {
  widget: Widget;
}

export function TrendWidget({ widget }: TrendWidgetProps) {
  const { go } = useAppNavigate();
  const isEditing = useDashboardStore((s) => s.isEditing);
  const dashboardId = useDashboardStore((s) => s.dashboardId);
  const { t } = useLocalTranslation(translations);

  const config = widget.insight?.config as TrendWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useTrendData(config ?? { series: [], granularity: 'day', date_from: '', date_to: '' } as any, widget.id);
  const result = query.data?.data;

  const hasValidSeries = hasConfig && config.series.length >= 1 && config.series.every((s) => s.event_name.trim() !== '');
  const totals = result?.series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)) ?? [];
  const mainTotal = totals[0] ?? 0;

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasValidSeries}
      configureMessage={hasConfig ? t('configureSeries') : t('noInsight')}
      isEditing={isEditing}
      onConfigure={() => go.dashboards.widget(dashboardId!, widget.id)}
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
    >
      <TrendChart
        series={result!.series}
        previousSeries={result!.series_previous}
        chartType={config!.chart_type}
        granularity={config!.granularity}
        compact
        formulas={config!.formulas}
      />
    </WidgetShell>
  );
}
