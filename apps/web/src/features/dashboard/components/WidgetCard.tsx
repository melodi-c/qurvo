import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { GripVertical } from 'lucide-react';
import { useDashboardStore } from '../store';
import { WidgetMenu } from './WidgetMenu';
import { FunnelWidget } from './widgets/funnel/FunnelWidget';
import { TrendWidget } from './widgets/trend/TrendWidget';
import type { Widget } from '@/api/generated/Api';

export function WidgetCard({ widget }: { widget: Widget }) {
  const isEditing = useDashboardStore((s) => s.isEditing);

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between py-2 px-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {isEditing && (
            <span className="drag-handle cursor-grab active:cursor-grabbing text-muted-foreground flex-shrink-0">
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <CardTitle className="text-sm font-medium truncate">{widget.name}</CardTitle>
        </div>
        {isEditing && <WidgetMenu widgetId={widget.id} />}
      </CardHeader>
      <CardContent className="flex-1 p-3 min-h-0">
        {widget.type === 'funnel' && <FunnelWidget widget={widget} />}
        {widget.type === 'trend' && <TrendWidget widget={widget} />}
      </CardContent>
    </Card>
  );
}
