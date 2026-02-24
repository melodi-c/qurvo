import { WidgetShell } from '../WidgetShell';
import { usePathsData } from '@/features/dashboard/hooks/use-paths';
import { PathsChart } from './PathsChart';
import type { Widget, PathsWidgetConfig } from '@/api/generated/Api';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './PathsWidget.translations';

interface PathsWidgetProps {
  widget: Widget;
}

export function PathsWidget({ widget }: PathsWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const config = widget.insight?.config as PathsWidgetConfig | undefined;
  const hasConfig = !!config;
  const query = usePathsData(config ?? { date_from: '', date_to: '', step_limit: 5 } as any, widget.id);
  const result = query.data?.data;

  return (
    <WidgetShell
      query={query}
      isConfigValid={hasConfig}
      configureMessage={t('noInsight')}
      isEmpty={!result || result.transitions.length === 0}
      emptyMessage={t('noPaths')}
      emptyHint={t('adjustDateRange')}
      skeletonVariant="flow"
      metric={<span className="text-xl font-bold tabular-nums text-primary">{result?.transitions.length ?? 0}</span>}
      metricSecondary={<span className="text-xs text-muted-foreground">{t('transitions')}</span>}
      cachedAt={query.data?.cached_at}
      fromCache={query.data?.from_cache}
    >
      <PathsChart
        transitions={result!.transitions}
        topPaths={result!.top_paths}
        compact
      />
    </WidgetShell>
  );
}
