import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardStore } from '@/features/dashboard/store';
import { useTrendData } from '@/features/dashboard/hooks/use-trend';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendWidget.translations';
import { TrendChart } from './TrendChart';
import type { Widget, TrendWidgetConfig } from '@/api/generated/Api';
import { formatDistanceToNow } from 'date-fns';

interface TrendWidgetProps {
  widget: Widget;
}

export function TrendWidget({ widget }: TrendWidgetProps) {
  const { go } = useAppNavigate();
  const isEditing = useDashboardStore((s) => s.isEditing);
  const dashboardId = useDashboardStore((s) => s.dashboardId);
  const { t } = useLocalTranslation(translations);

  const config = widget.insight?.config as TrendWidgetConfig | undefined;
  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('noInsight')}
      </div>
    );
  }
  const { data, isLoading, isFetching, error, refresh } = useTrendData(config, widget.id);

  const handleConfigure = () => {
    go.dashboards.widget(dashboardId!, widget.id);
  };

  const hasValidSeries = config.series.length >= 1 && config.series.every((s) => s.event_name.trim() !== '');

  if (!hasValidSeries) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-muted-foreground text-sm text-center">
          {t('configureSeries')}
        </p>
        {isEditing && (
          <Button size="sm" variant="ghost" onClick={handleConfigure}>
            {t('configure')}
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-2 h-full justify-center">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-muted-foreground text-sm">{t('loadFailed')}</p>
        <Button size="sm" variant="ghost" onClick={() => refresh()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const result = data.data;
  if (result.series.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <p className="text-muted-foreground text-sm">{t('noEvents')}</p>
        <p className="text-muted-foreground/60 text-xs">{t('adjustRange')}</p>
      </div>
    );
  }

  // Compute summary: total for each series
  const totals = result.series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0));
  const mainTotal = totals[0] ?? 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Metric header + cache */}
      <div className="flex items-center justify-between flex-shrink-0 pb-2 border-b border-border/40 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl font-bold tabular-nums text-primary">
            {mainTotal.toLocaleString()}
          </span>
          {totals.length > 1 && (
            <span className="text-xs text-muted-foreground tabular-nums truncate">
              {totals.slice(1).map((t) => t.toLocaleString()).join(' / ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
            {data.from_cache
              ? formatDistanceToNow(new Date(data.cached_at), { addSuffix: true })
              : t('fresh')}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => refresh()}
            disabled={isFetching}
            title={t('refresh')}
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Compact chart */}
      <div className="flex-1 overflow-hidden min-h-0">
        <TrendChart
          series={result.series}
          previousSeries={result.series_previous}
          chartType={config.chart_type}
          granularity={config.granularity}
          compact
          formulas={config.formulas}
        />
      </div>
    </div>
  );
}
