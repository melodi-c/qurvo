import { GripVertical, FileText, RefreshCw, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatting';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { InsightTypeIcon, TYPE_META } from '@/features/insights/components/InsightTypeIcon';
import { useDashboardStore } from '../store';
import { InsightCardMenu } from './InsightCardMenu';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightCardHeader.translations';
import type { Widget } from '@/api/generated/Api';
import type { WidgetControls } from './widgets/WidgetControlsContext';

interface InsightCardHeaderProps {
  widget: Widget;
  controls?: WidgetControls | null;
  onEditText?: () => void;
  onExpand?: () => void;
}

export function InsightCardHeader({
  widget,
  controls,
  onEditText,
  onExpand,
}: InsightCardHeaderProps) {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const { t } = useLocalTranslation(translations);

  const insight = widget.insight;
  const isTextTile = !insight;
  const insightType = insight?.type;
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

      {/* Widget controls: cache time + CSV export + refresh */}
      {controls && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {controls.cachedAt && (
            <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
              {controls.fromCache
                ? formatRelativeTime(controls.cachedAt)
                : t('fresh')}
            </span>
          )}
          {controls.onExportCsv && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="drag-cancel h-6 w-6"
                  onClick={controls.onExportCsv}
                  aria-label={t('exportCsv')}
                >
                  <Download className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('exportCsv')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="drag-cancel h-6 w-6"
                onClick={controls.onRefresh}
                disabled={controls.isFetching}
                aria-label={t('refresh')}
              >
                <RefreshCw className={cn('h-3 w-3', controls.isFetching && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('refresh')}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Menu (always visible) */}
      <InsightCardMenu widget={widget} onEditText={onEditText} onExpand={onExpand} />
    </div>
  );
}
