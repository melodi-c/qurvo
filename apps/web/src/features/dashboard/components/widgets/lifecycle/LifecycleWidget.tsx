import { useCallback } from 'react';
import { WidgetShell } from '../WidgetShell';
import { useRegisterWidgetControls } from '../WidgetControlsContext';
import { useDashboardStore } from '@/features/dashboard/store';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useLifecycleData } from '@/features/dashboard/hooks/use-lifecycle';
import { LifecycleChart } from './LifecycleChart';
import { defaultLifecycleConfig } from './lifecycle-shared';
import { lifecycleToCsv, downloadCsv } from '@/lib/csv-export';
import type { Widget, LifecycleWidgetConfig } from '@/api/generated/Api';
import translations from './LifecycleWidget.translations';

interface LifecycleWidgetProps {
  widget: Widget;
}

export function LifecycleWidget({ widget }: LifecycleWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const isEditing = useDashboardStore((s) => s.isEditing);
  const config = widget.insight?.config as LifecycleWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useLifecycleData(config ?? defaultLifecycleConfig(), widget.id);
  const result = query.data?.data;

  const handleExportCsv = useCallback(() => {
    if (!result) {return;}
    downloadCsv(lifecycleToCsv(result), 'lifecycle.csv');
  }, [result]);

  const handleRefresh = useCallback(() => {
    void query.refresh();
  }, [query]);

  useRegisterWidgetControls({
    onRefresh: handleRefresh,
    isFetching: query.isFetching,
    cachedAt: query.data?.cached_at,
    fromCache: query.data?.from_cache,
    onExportCsv: result ? handleExportCsv : undefined,
  });

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasConfig && !!config.target_event}
      configureMessage={hasConfig ? t('configureEvent') : t('noInsight')}
      isEditing={isEditing}
      isEmpty={!result || result.data.length === 0}
      emptyMessage={t('noData')}
      emptyHint={t('adjustDateRange')}
    >
      {result && <LifecycleChart result={result} compact />}
    </WidgetShell>
  );
}
