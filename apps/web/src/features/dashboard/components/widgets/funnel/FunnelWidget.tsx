import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardStore } from '@/features/dashboard/store';
import { useFunnelData } from '@/features/dashboard/hooks/use-funnel';
import { FunnelEditor } from './FunnelEditor';
import { FunnelChart } from './FunnelChart';
import type { Widget, FunnelWidgetConfig, FunnelStepResult } from '@/features/dashboard/types';
import { formatDistanceToNow } from 'date-fns';

interface FunnelWidgetProps {
  widget: Widget;
}

export function FunnelWidget({ widget }: FunnelWidgetProps) {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const editingWidgetId = useDashboardStore((s) => s.editingWidgetId);
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const setEditingWidget = useDashboardStore((s) => s.setEditingWidget);

  const config = widget.config as FunnelWidgetConfig;
  const isConfiguring = isEditing && editingWidgetId === widget.id;

  const { data, isLoading, isFetching, error, refresh } = useFunnelData(config, widget.id);

  const handleConfigSave = (newConfig: FunnelWidgetConfig, newName: string) => {
    updateWidgetConfig(widget.id, newConfig, newName);
  };

  if (isConfiguring) {
    return (
      <div className="h-full overflow-auto">
        <FunnelEditor
          initialConfig={config}
          initialName={widget.name}
          onSave={handleConfigSave}
          onCancel={() => setEditingWidget(null)}
        />
      </div>
    );
  }

  if (config.steps.length < 2 || config.steps.some((s) => !s.event_name.trim())) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-muted-foreground text-sm text-center">
          Configure funnel steps to see data
        </p>
        {isEditing && (
          <Button size="sm" variant="ghost" onClick={() => setEditingWidget(widget.id)}>
            Configure
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        Loading...
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
