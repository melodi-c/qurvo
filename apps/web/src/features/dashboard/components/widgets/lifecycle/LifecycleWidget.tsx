import { useCallback } from 'react';
import { WidgetShell } from '../WidgetShell';
import { useDashboardStore } from '@/features/dashboard/store';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useLifecycleData } from '@/features/dashboard/hooks/use-lifecycle';
import { LifecycleChart } from './LifecycleChart';
import { defaultLifecycleConfig } from './lifecycle-shared';
import { lifecycleToCsv, downloadCsv } from '@/lib/csv-export';
import { formatCompactNumber } from '@/lib/formatting';
import { pluralize } from '@/i18n/pluralize';
import type { Widget, LifecycleWidgetConfig } from '@/api/generated/Api';
import translations from './LifecycleWidget.translations';

interface LifecycleWidgetProps {
  widget: Widget;
}

export function LifecycleWidget({ widget }: LifecycleWidgetProps) {
  const { t, lang } = useLocalTranslation(translations);
  const isEditing = useDashboardStore((s) => s.isEditing);
  const config = widget.insight?.config as LifecycleWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useLifecycleData(config ?? defaultLifecycleConfig(), widget.id);
  const result = query.data?.data;

  const activeUsers = result
    ? result.totals.new + result.totals.returning + result.totals.resurrecting
    : 0;

  const activeUsersLabel = pluralize(
    activeUsers,
    { one: t('activeUsersOne'), few: t('activeUsersFew'), many: t('activeUsersMany') },
    lang,
  );

  const handleExportCsv = useCallback(() => {
    if (!result) return;
    downloadCsv(lifecycleToCsv(result), 'lifecycle.csv');
  }, [result]);

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasConfig && !!config.target_event}
      configureMessage={hasConfig ? t('configureEvent') : t('noInsight')}
      isEditing={isEditing}
      isEmpty={!result || result.data.length === 0}
      emptyMessage={t('noData')}
      emptyHint={t('adjustDateRange')}
      metric={<span className="text-xl font-bold tabular-nums text-primary">{formatCompactNumber(activeUsers)}</span>}
      metricSecondary={<span className="text-xs text-muted-foreground">{activeUsersLabel}</span>}
      cachedAt={query.data?.cached_at}
      fromCache={query.data?.from_cache}
      onExportCsv={result ? handleExportCsv : undefined}
    >
      {result && <LifecycleChart result={result} compact />}
    </WidgetShell>
  );
}
