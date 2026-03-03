import { useCallback } from 'react';
import { WidgetShell } from '../WidgetShell';
import { useRegisterWidgetControls } from '../WidgetControlsContext';
import { useDashboardStore } from '@/features/dashboard/store';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { FunnelChart } from './FunnelChart';
import { defaultFunnelConfig } from './funnel-shared';
import translations from './FunnelWidget.translations';
import { funnelToCsv, downloadCsv } from '@/lib/csv-export';
import type { Widget, FunnelWidgetConfig } from '@/api/generated/Api';

interface FunnelWidgetProps {
  widget: Widget;
}

export function FunnelWidget({ widget }: FunnelWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const isEditing = useDashboardStore((s) => s.isEditing);

  const config = widget.insight?.config as FunnelWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useFunnelData(config ?? defaultFunnelConfig(t('step1Label'), t('step2Label')), widget.id);
  const result = query.data?.data;

  const hasValidSteps = hasConfig && config.steps.length >= 2 && config.steps.every((s) => s.event_name.trim() !== '');

  const handleExportCsv = useCallback(() => {
    if (!result?.steps) {return;}
    downloadCsv(funnelToCsv(result.steps), 'funnel.csv');
  }, [result]);

  const handleRefresh = useCallback(() => {
    void query.refresh();
  }, [query]);

  useRegisterWidgetControls({
    onRefresh: handleRefresh,
    isFetching: query.isFetching,
    cachedAt: query.data?.cached_at,
    fromCache: query.data?.from_cache,
    onExportCsv: result?.steps ? handleExportCsv : undefined,
  });

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasValidSteps}
      configureMessage={hasConfig ? t('configureSteps') : t('noInsightLinked')}
      isEditing={isEditing}
      isEmpty={!result || result.steps.length === 0}
      emptyMessage={t('noEventsFound')}
      emptyHint={t('tryAdjusting')}
    >
      {result && (
        <div className="h-full overflow-auto">
          <FunnelChart steps={result.steps} breakdown={result.breakdown} aggregateSteps={result.aggregate_steps} compact conversionRateDisplay={config!.conversion_rate_display ?? 'total'} />
        </div>
      )}
    </WidgetShell>
  );
}
