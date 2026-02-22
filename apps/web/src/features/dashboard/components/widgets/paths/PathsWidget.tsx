import { RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePathsData } from '@/features/dashboard/hooks/use-paths';
import { PathsChart } from './PathsChart';
import type { Widget, PathsWidgetConfig } from '@/api/generated/Api';
import { formatDistanceToNow } from 'date-fns';

interface PathsWidgetProps {
  widget: Widget;
}

export function PathsWidget({ widget }: PathsWidgetProps) {
  const config = widget.insight?.config as PathsWidgetConfig | undefined;
  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No insight linked
      </div>
    );
  }

  const { data, isLoading, isFetching, error, refresh } = usePathsData(config, widget.id);

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
        <p className="text-muted-foreground text-sm">Failed to load paths data</p>
        <Button size="sm" variant="ghost" onClick={() => refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  const result = data.data;
  if (result.transitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <p className="text-muted-foreground text-sm">No paths found</p>
        <p className="text-muted-foreground/60 text-xs">Try adjusting the date range or filters</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between flex-shrink-0 pb-2 border-b border-border/40 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl font-bold tabular-nums text-primary">
            {result.transitions.length}
          </span>
          <span className="text-xs text-muted-foreground">transitions</span>
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

      <div className="flex-1 overflow-hidden min-h-0">
        <PathsChart
          transitions={result.transitions}
          topPaths={result.top_paths}
          compact
        />
      </div>
    </div>
  );
}
