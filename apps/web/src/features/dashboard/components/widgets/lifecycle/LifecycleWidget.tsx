import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLifecycleData } from '@/features/dashboard/hooks/use-lifecycle';
import { LifecycleChart } from './LifecycleChart';
import type { Widget, LifecycleWidgetConfig } from '@/api/generated/Api';
import { formatDistanceToNow } from 'date-fns';

interface LifecycleWidgetProps {
  widget: Widget;
}

export function LifecycleWidget({ widget }: LifecycleWidgetProps) {
  const config = widget.insight?.config as LifecycleWidgetConfig | undefined;
  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No insight linked
      </div>
    );
  }

  const { data, isLoading, isFetching, error, refresh } = useLifecycleData(config, widget.id);

  if (!config.target_event) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Configure an event to see lifecycle data
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
        <p className="text-muted-foreground text-sm">Failed to load lifecycle data</p>
        <Button size="sm" variant="ghost" onClick={() => refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  const result = data.data;
  if (result.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <p className="text-muted-foreground text-sm">No data found</p>
        <p className="text-muted-foreground/60 text-xs">Try adjusting the date range</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between flex-shrink-0 pb-2 border-b border-border/40 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl font-bold tabular-nums text-primary">
            {result.totals.new + result.totals.returning + result.totals.resurrecting}
          </span>
          <span className="text-xs text-muted-foreground">active users</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
            {data.from_cache
              ? formatDistanceToNow(new Date(data.cached_at), { addSuffix: true })
              : 'fresh'}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => refresh()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <LifecycleChart result={result} compact />
      </div>
    </div>
  );
}
