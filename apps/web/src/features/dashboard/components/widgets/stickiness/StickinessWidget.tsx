import { WidgetShell } from '../WidgetShell';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useStickinessData } from '@/features/dashboard/hooks/use-stickiness';
import { StickinessChart } from './StickinessChart';
import type { Widget, StickinessWidgetConfig } from '@/api/generated/Api';
import translations from './StickinessWidget.translations';

interface StickinessWidgetProps {
  widget: Widget;
}

export function StickinessWidget({ widget }: StickinessWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const config = widget.insight?.config as StickinessWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useStickinessData(config ?? { target_event: '', granularity: 'day', date_from: '', date_to: '' } as any, widget.id);
  const result = query.data?.data;

  const totalUsers = result?.data.reduce((sum, d) => sum + d.user_count, 0) ?? 0;

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasConfig && !!config.target_event}
      configureMessage={hasConfig ? t('configureEvent') : t('noInsight')}
      isEmpty={!result || result.data.length === 0}
      emptyMessage={t('noData')}
      emptyHint={t('adjustDateRange')}
      metric={<span className="text-xl font-bold tabular-nums text-primary">{totalUsers}</span>}
      metricSecondary={<span className="text-xs text-muted-foreground">{t('totalUsers')}</span>}
      cachedAt={query.data?.cached_at}
      fromCache={query.data?.from_cache}
    >
      <StickinessChart result={result!} compact />
    </WidgetShell>
  );
}
