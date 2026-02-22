import { MoreHorizontal, ExternalLink, RefreshCw, Trash2, Pencil, Copy, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useDashboardStore } from '../store';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightCardMenu.translations';
import type { Widget } from '@/api/generated/Api';

interface InsightCardMenuProps {
  widget: Widget;
  onRefresh?: () => void;
  onEditText?: () => void;
  onExpand?: () => void;
}

export function InsightCardMenu({ widget, onRefresh, onEditText, onExpand }: InsightCardMenuProps) {
  const { go } = useAppNavigate();
  const isEditing = useDashboardStore((s) => s.isEditing);
  const duplicateWidget = useDashboardStore((s) => s.duplicateWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const { t } = useLocalTranslation(translations);

  const insight = widget.insight;
  const isTextTile = !insight;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="drag-cancel h-6 w-6 flex-shrink-0">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {insight && (
          <DropdownMenuItem onClick={() => go.insights.detailByType(insight.type as any, insight.id)}>
            <ExternalLink />
            {t('openInsight')}
          </DropdownMenuItem>
        )}
        {!isTextTile && onRefresh && (
          <DropdownMenuItem onClick={onRefresh}>
            <RefreshCw />
            {t('refresh')}
          </DropdownMenuItem>
        )}
        {!isTextTile && onExpand && (
          <DropdownMenuItem onClick={onExpand}>
            <Maximize2 />
            {t('expand')}
          </DropdownMenuItem>
        )}
        {isTextTile && isEditing && onEditText && (
          <DropdownMenuItem onClick={onEditText}>
            <Pencil />
            {t('editText')}
          </DropdownMenuItem>
        )}
        {isEditing && (
          <DropdownMenuItem onClick={() => duplicateWidget(widget.id)}>
            <Copy />
            {t('duplicate')}
          </DropdownMenuItem>
        )}
        {isEditing && (
          <DropdownMenuItem variant="destructive" onClick={() => removeWidget(widget.id)}>
            <Trash2 />
            {t('remove')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
