import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import type { WidgetDataResult } from '@/features/dashboard/hooks/create-widget-data-hook';
import { WidgetSkeleton } from './WidgetSkeleton';
import { WidgetTransition } from './WidgetTransition';
import translations from './WidgetShell.translations';

type SkeletonVariant = 'chart' | 'table' | 'flow';

interface WidgetShellProps<Response> {
  query: WidgetDataResult<Response>;
  /** Whether config is valid (has required fields filled). */
  isConfigValid: boolean;
  /** Message shown when config is incomplete. */
  configureMessage?: string;
  /** Whether dashboard is in editing mode (shows configure button). */
  isEditing?: boolean;
  /** Callback to open widget config panel. */
  onConfigure?: () => void;
  /** Whether data is empty (no results). */
  isEmpty: boolean;
  /** Message shown when there are no results. */
  emptyMessage?: string;
  /** Secondary message for empty state. */
  emptyHint?: string;
  /** Skeleton variant to use while loading. */
  skeletonVariant?: SkeletonVariant;
  /** Primary metric to show in the header. */
  metric: ReactNode;
  /** Secondary metric info next to primary. */
  metricSecondary?: ReactNode;
  /** Cache info source — response object with cached_at. */
  cachedAt?: string;
  fromCache?: boolean;
  /** Content to render (chart/table). */
  children: ReactNode;
}

export function WidgetShell<Response>({
  query,
  isConfigValid,
  configureMessage,
  isEditing,
  onConfigure,
  isEmpty,
  emptyMessage,
  emptyHint,
  skeletonVariant = 'chart',
  metric,
  metricSecondary,
  cachedAt,
  fromCache,
  children,
}: WidgetShellProps<Response>) {
  const { t } = useLocalTranslation(translations);
  const { isLoading, isFetching, error, refresh, data } = query;

  if (!isConfigValid) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-muted-foreground text-sm text-center">
          {configureMessage ?? t('configureWidget')}
        </p>
        {isEditing && onConfigure && (
          <Button size="sm" variant="ghost" onClick={onConfigure}>
            {t('configure')}
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return <WidgetSkeleton variant={skeletonVariant} />;
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

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <p className="text-muted-foreground text-sm">{emptyMessage ?? t('noData')}</p>
        {emptyHint && (
          <p className="text-muted-foreground/60 text-xs">{emptyHint}</p>
        )}
      </div>
    );
  }

  return (
    <WidgetTransition isFetching={isFetching}>
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center justify-between flex-shrink-0 pb-2 border-b border-border/40 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            {metric}
            {metricSecondary}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {cachedAt && (
              <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                {fromCache
                  ? formatDistanceToNow(new Date(cachedAt), { addSuffix: true })
                  : t('fresh')}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={() => refresh()}
                  disabled={isFetching}
                  aria-label={t('refresh')}
                >
                  <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('refresh')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 overflow-hidden min-h-0">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </div>
    </WidgetTransition>
  );
}
