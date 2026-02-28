import { useState, useCallback } from 'react';
import { MoreHorizontal, ExternalLink, Trash2, Pencil, Copy, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useDashboardStore } from '../store';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightCardMenu.translations';
import type { Widget } from '@/api/generated/Api';

interface InsightCardMenuProps {
  widget: Widget;
  onEditText?: () => void;
  onExpand?: () => void;
}

export function InsightCardMenu({ widget, onEditText, onExpand }: InsightCardMenuProps) {
  const { go } = useAppNavigate();
  const isEditing = useDashboardStore((s) => s.isEditing);
  const duplicateWidget = useDashboardStore((s) => s.duplicateWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const { t } = useLocalTranslation(translations);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const insight = widget.insight;
  const isTextTile = !insight;

  const handleConfirmRemove = useCallback(() => {
    removeWidget(widget.id);
  }, [removeWidget, widget.id]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="drag-cancel h-6 w-6 flex-shrink-0">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {insight && (
            <DropdownMenuItem onClick={() => go.insights.detailByType(insight.type, insight.id)}>
              <ExternalLink />
              {t('openInsight')}
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
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                <Trash2 />
                {t('remove')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('removeTitle')}
        description={t('removeDescription')}
        confirmLabel={t('removeConfirm')}
        onConfirm={handleConfirmRemove}
      />
    </>
  );
}
