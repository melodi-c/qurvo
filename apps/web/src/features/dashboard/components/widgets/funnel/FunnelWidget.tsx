import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WidgetSkeleton } from '../WidgetSkeleton';
import { WidgetTransition } from '../WidgetTransition';
import { useDashboardStore } from '@/features/dashboard/store';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getFunnelMetrics } from './funnel-utils';
import { FunnelChart } from './FunnelChart';
import translations from './FunnelWidget.translations';
import type { Widget, FunnelWidgetConfig } from '@/api/generated/Api';
import { formatDistanceToNow } from 'date-fns';

interface FunnelWidgetProps {
  widget: Widget;
}

export function FunnelWidget({ widget }: FunnelWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const { go } = useAppNavigate();
  const isEditing = useDashboardStore((s) => s.isEditing);
  const dashboardId = useDashboardStore((s) => s.dashboardId);

  const config = widget.insight?.config as FunnelWidgetConfig | undefined;
  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('noInsightLinked')}
      </div>
    );
  }
  const { data, isLoading, isFetching, error, refresh } = useFunnelData(config, widget.id);

  const handleConfigure = () => {
    go.dashboards.widget(dashboardId!, widget.id);
  };

  if (config.steps.length < 2 || config.steps.some((s) => !s.event_name.trim())) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-muted-foreground text-sm text-center">
          {t('configureSteps')}
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
    return <WidgetSkeleton variant="chart" />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-muted-foreground text-sm">{t('failedToLoad')}</p>
        <Button size="sm" variant="ghost" onClick={() => refresh()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const steps = data.data.steps;
  const breakdown = data.data.breakdown;
  const aggregateSteps = data.data.aggregate_steps;
  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(data.data);

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <p className="text-muted-foreground text-sm">{t('noEventsFound')}</p>
        <p className="text-muted-foreground/60 text-xs">{t('tryAdjusting')}</p>
      </div>
    );
  }

  return (
    <WidgetTransition isFetching={isFetching}>
      <div className="h-full flex flex-col min-h-0">
        {/* Metric header + cache */}
        <div className="flex items-center justify-between flex-shrink-0 pb-2 border-b border-border/40 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl font-bold tabular-nums text-primary">{overallConversion}%</span>
            <span className="text-xs text-muted-foreground tabular-nums truncate">
              {totalEntered?.toLocaleString()} &rarr; {totalConverted?.toLocaleString()}
            </span>
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
        <div className="flex-1 overflow-auto min-h-0">
          <FunnelChart steps={steps} breakdown={breakdown} aggregateSteps={aggregateSteps} compact />
        </div>
      </div>
    </WidgetTransition>
  );
}
