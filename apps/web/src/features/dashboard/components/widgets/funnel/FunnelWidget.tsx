import { RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardStore } from '@/features/dashboard/store';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { FunnelChart } from './FunnelChart';
import type { Widget, FunnelWidgetConfig, FunnelStepResult } from '@/features/dashboard/types';
import { formatDistanceToNow } from 'date-fns';

interface FunnelWidgetProps {
  widget: Widget;
}

export function FunnelWidget({ widget }: FunnelWidgetProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const isEditing = useDashboardStore((s) => s.isEditing);
  const dashboardId = useDashboardStore((s) => s.dashboardId);

  const config = widget.config as FunnelWidgetConfig;
  const { data, isLoading, isFetching, error, refresh } = useFunnelData(config, widget.id);

  const handleConfigure = () => {
    navigate(`/dashboards/${dashboardId}/widgets/${widget.id}?project=${projectId}`);
  };

  if (config.steps.length < 2 || config.steps.some((s) => !s.event_name.trim())) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-muted-foreground text-sm text-center">
          Configure funnel steps to see data
        </p>
        {isEditing && (
          <Button size="sm" variant="ghost" onClick={handleConfigure}>
            Configure
          </Button>
        )}
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
        <p className="text-muted-foreground text-sm">Failed to load funnel data</p>
        <Button size="sm" variant="ghost" onClick={() => refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  const steps = data.data.steps as FunnelStepResult[];

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <p className="text-muted-foreground text-sm">No events found</p>
        <p className="text-muted-foreground/60 text-xs">Try adjusting the date range or steps</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-1 min-h-0">
      <div className="flex items-center justify-between text-xs text-muted-foreground flex-shrink-0">
        <span>
          {data.from_cache ? (
            <>Updated {formatDistanceToNow(new Date(data.cached_at), { addSuffix: true })}</>
          ) : (
            <>Fresh data</>
          )}
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

      <div className="flex-1 overflow-auto">
        <FunnelChart steps={steps} />
      </div>
    </div>
  );
}
