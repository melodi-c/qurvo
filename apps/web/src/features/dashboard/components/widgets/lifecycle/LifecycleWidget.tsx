import { WidgetShell } from '../WidgetShell';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useLifecycleData } from '@/features/dashboard/hooks/use-lifecycle';
import { LifecycleChart } from './LifecycleChart';
import { defaultLifecycleConfig } from './lifecycle-shared';
import type { Widget, LifecycleWidgetConfig } from '@/api/generated/Api';
import translations from './LifecycleWidget.translations';

interface LifecycleWidgetProps {
  widget: Widget;
}

export function LifecycleWidget({ widget }: LifecycleWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const config = widget.insight?.config as LifecycleWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useLifecycleData(config ?? defaultLifecycleConfig(), widget.id);
  const result = query.data?.data;

  const activeUsers = result
    ? result.totals.new + result.totals.returning + result.totals.resurrecting
    : 0;

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasConfig && !!config.target_event}
      configureMessage={hasConfig ? t('configureEvent') : t('noInsight')}
      isEmpty={!result || result.data.length === 0}
      emptyMessage={t('noData')}
      emptyHint={t('adjustDateRange')}
      metric={<span className="text-xl font-bold tabular-nums text-primary">{activeUsers}</span>}
      metricSecondary={<span className="text-xs text-muted-foreground">{t('activeUsers')}</span>}
      cachedAt={query.data?.cached_at}
      fromCache={query.data?.from_cache}
    >
      <LifecycleChart result={result!} compact />
    </WidgetShell>
  );
}
