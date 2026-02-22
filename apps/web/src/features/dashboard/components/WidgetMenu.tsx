import { MoreHorizontal, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useDashboardStore } from '../store';
import type { Widget } from '@/api/generated/Api';

export function WidgetMenu({ widget }: { widget: Widget }) {
  const { go } = useAppNavigate();
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  const insight = widget.insight;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {insight && (
          <DropdownMenuItem onClick={() => go.insights.detailByType(insight.type as any, insight.id)}>
            <ExternalLink />
            Open insight
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => removeWidget(widget.id)}>
          <Trash2 />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
