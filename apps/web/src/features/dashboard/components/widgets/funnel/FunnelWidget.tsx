import { WidgetShell } from '../WidgetShell';
import { useDashboardStore } from '@/features/dashboard/store';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { getFunnelMetrics } from './funnel-utils';
import { FunnelChart } from './FunnelChart';
import translations from './FunnelWidget.translations';
import type { Widget, FunnelWidgetConfig } from '@/api/generated/Api';

interface FunnelWidgetProps {
  widget: Widget;
}

export function FunnelWidget({ widget }: FunnelWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const { go } = useAppNavigate();
  const isEditing = useDashboardStore((s) => s.isEditing);
  const dashboardId = useDashboardStore((s) => s.dashboardId);

  const config = widget.insight?.config as FunnelWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useFunnelData(config ?? { steps: [], conversion_window_days: 14, date_from: '', date_to: '' } as any, widget.id);
  const result = query.data?.data;

  const hasValidSteps = hasConfig && config.steps.length >= 2 && config.steps.every((s) => s.event_name.trim() !== '');
  const { overallConversion, totalEntered, totalConverted } = getFunnelMetrics(result);

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasValidSteps}
      configureMessage={hasConfig ? t('configureSteps') : t('noInsightLinked')}
      isEditing={isEditing}
      onConfigure={() => go.dashboards.widget(dashboardId!, widget.id)}
      isEmpty={!result || result.steps.length === 0}
      emptyMessage={t('noEventsFound')}
      emptyHint={t('tryAdjusting')}
      metric={<span className="text-xl font-bold tabular-nums text-primary">{overallConversion}%</span>}
      metricSecondary={
        <span className="text-xs text-muted-foreground tabular-nums truncate">
          {totalEntered?.toLocaleString()} &rarr; {totalConverted?.toLocaleString()}
        </span>
      }
      cachedAt={query.data?.cached_at}
      fromCache={query.data?.from_cache}
    >
      <div className="h-full overflow-auto">
        <FunnelChart steps={result!.steps} breakdown={result!.breakdown} aggregateSteps={result!.aggregate_steps} compact conversionRateDisplay={config!.conversion_rate_display ?? 'total'} />
      </div>
    </WidgetShell>
  );
}
