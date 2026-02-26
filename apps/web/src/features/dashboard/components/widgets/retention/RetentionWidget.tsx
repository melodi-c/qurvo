import { useCallback } from 'react';
import { WidgetShell } from '../WidgetShell';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useRetentionData } from '@/features/dashboard/hooks/use-retention';
import { RetentionTable } from './RetentionTable';
import { defaultRetentionConfig } from './retention-shared';
import { retentionToCsv, downloadCsv } from '@/lib/csv-export';
import type { Widget, RetentionWidgetConfig } from '@/api/generated/Api';
import translations from './RetentionWidget.translations';

interface RetentionWidgetProps {
  widget: Widget;
}

export function RetentionWidget({ widget }: RetentionWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const config = widget.insight?.config as RetentionWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = useRetentionData(config ?? defaultRetentionConfig(), widget.id);
  const result = query.data?.data;

  const handleExportCsv = useCallback(() => {
    if (!result) return;
    downloadCsv(retentionToCsv(result), 'retention.csv');
  }, [result]);

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasConfig && !!config.target_event}
      configureMessage={hasConfig ? t('configureEvent') : t('noInsight')}
      isEmpty={!result || result.cohorts.length === 0}
      emptyMessage={t('noData')}
      emptyHint={t('adjustDateRange')}
      skeletonVariant="table"
      metric={<span className="text-xl font-bold tabular-nums text-primary">{result?.cohorts.length ?? 0}</span>}
      metricSecondary={<span className="text-xs text-muted-foreground">{t('cohorts')}</span>}
      cachedAt={query.data?.cached_at}
      fromCache={query.data?.from_cache}
      onExportCsv={result ? handleExportCsv : undefined}
    >
      <div className="h-full overflow-auto">
        <RetentionTable result={result!} compact />
      </div>
    </WidgetShell>
  );
}
