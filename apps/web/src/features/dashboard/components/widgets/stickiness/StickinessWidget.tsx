import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useStickinessData } from '@/features/dashboard/hooks/use-stickiness';
import { StickinessChart } from './StickinessChart';
import type { Widget, StickinessWidgetConfig } from '@/api/generated/Api';
import { formatDistanceToNow } from 'date-fns';
import translations from './StickinessWidget.translations';

interface StickinessWidgetProps {
  widget: Widget;
}

export function StickinessWidget({ widget }: StickinessWidgetProps) {
  const { t } = useLocalTranslation(translations);
  const config = widget.insight?.config as StickinessWidgetConfig | undefined;
  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('noInsight')}
      </div>
    );
  }

  const { data, isLoading, isFetching, error, refresh } = useStickinessData(config, widget.id);

  if (!config.target_event) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t('configureEvent')}
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
  if (result.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <p className="text-muted-foreground text-sm">{t('noData')}</p>
        <p className="text-muted-foreground/60 text-xs">{t('adjustDateRange')}</p>
      </div>
    );
  }

  const totalUsers = result.data.reduce((sum, d) => sum + d.user_count, 0);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between flex-shrink-0 pb-2 border-b border-border/40 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl font-bold tabular-nums text-primary">
            {totalUsers}
          </span>
          <span className="text-xs text-muted-foreground">{t('totalUsers')}</span>
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
      <div className="flex-1 overflow-hidden min-h-0">
        <StickinessChart result={result} compact />
      </div>
    </div>
  );
}
