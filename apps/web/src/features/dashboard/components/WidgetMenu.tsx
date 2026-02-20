import { MoreHorizontal, ExternalLink, Trash2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDashboardStore } from '../store';
import type { Widget } from '@/api/generated/Api';

export function WidgetMenu({ widget }: { widget: Widget }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  const insight = widget.insight;
  const insightPath = insight
    ? `/${insight.type === 'trend' ? 'trends' : 'funnels'}/${insight.id}?project=${projectId}`
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {insightPath && (
          <DropdownMenuItem onClick={() => navigate(insightPath)}>
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
