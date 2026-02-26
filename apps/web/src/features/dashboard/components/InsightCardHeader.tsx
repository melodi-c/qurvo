import { GripVertical, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InsightTypeIcon, TYPE_META } from '@/features/insights/components/InsightTypeIcon';
import { useDashboardStore } from '../store';
import { InsightCardMenu } from './InsightCardMenu';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightCardHeader.translations';
import type { Widget, InsightType } from '@/api/generated/Api';

interface InsightCardHeaderProps {
  widget: Widget;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onEditText?: () => void;
  onExpand?: () => void;
}

export function InsightCardHeader({
  widget,
  detailsOpen,
  onToggleDetails,
  onEditText,
  onExpand,
}: InsightCardHeaderProps) {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const { t } = useLocalTranslation(translations);

  const insight = widget.insight;
  const isTextTile = !insight;
  const insightType = insight?.type as InsightType | undefined;
  const typeLabel = insightType ? t(insightType) : t('textTile');
  const displayName = insight?.name || t('untitled');
  const colorClass = insightType
    ? TYPE_META[insightType]?.colorClass ?? 'text-muted-foreground'
    : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0 min-h-[40px]">
      {/* Drag handle */}
      {isEditing && (
        <span className="drag-handle cursor-grab active:cursor-grabbing text-muted-foreground flex-shrink-0">
          <GripVertical className="h-4 w-4" />
        </span>
      )}

      {/* Type badge */}
      <Badge variant="outline" className={`drag-cancel gap-1 text-[10px] px-1.5 py-0.5 flex-shrink-0 ${colorClass}`}>
        {isTextTile ? (
          <FileText className="h-3 w-3" />
        ) : (
          <InsightTypeIcon type={insightType!} className="h-3 w-3" />
        )}
        {typeLabel}
      </Badge>

      {/* Title */}
      <span className="text-sm font-medium truncate flex-1 min-w-0">
        {isTextTile ? t('textTile') : displayName}
      </span>

      {/* Details toggle (only for insight tiles) */}
      {!isTextTile && (
        <span className="relative -m-2 p-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="drag-cancel"
            onClick={onToggleDetails}
          >
            {detailsOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        </span>
      )}

      {/* Menu (always visible) */}
      <InsightCardMenu widget={widget} onEditText={onEditText} onExpand={onExpand} />
    </div>
  );
}
