import { useCallback, useState } from 'react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useDashboardStore } from '../store';
import cardTranslations from './InsightCard.translations';
import { applyFilterOverrides } from '../lib/filter-overrides';
import { InsightCardHeader } from './InsightCardHeader';
import { InsightCardDetails } from './InsightCardDetails';
import { InsightCardViz } from './InsightCardViz';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Widget } from '@/api/generated/Api';

interface InsightCardProps {
  widget: Widget;
}

export function InsightCard({ widget }: InsightCardProps) {
  const { t } = useLocalTranslation(cardTranslations);
  const filterOverrides = useDashboardStore((s) => s.filterOverrides);
  const requestTextFocus = useDashboardStore((s) => s.requestTextFocus);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const isTextTile = !widget.insight;
  const baseConfig = widget.insight?.config;

  // Apply dashboard-level filter overrides (date + property filters)
  const mergedConfig = baseConfig
    ? applyFilterOverrides(baseConfig, filterOverrides)
    : baseConfig;

  const handleToggleDetails = useCallback(() => setDetailsOpen((v) => !v), []);
  const handleEditText = useCallback(() => requestTextFocus(widget.id), [requestTextFocus, widget.id]);
  const handleExpand = useCallback(() => setFullscreen(true), []);

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <InsightCardHeader
          widget={widget}
          detailsOpen={detailsOpen}
          onToggleDetails={handleToggleDetails}
          onEditText={isTextTile ? handleEditText : undefined}
          onExpand={!isTextTile ? handleExpand : undefined}
        />

        {detailsOpen && !isTextTile && mergedConfig && (
          <InsightCardDetails config={mergedConfig} filterOverrides={filterOverrides} />
        )}

        <div className="flex-1 p-3 min-h-0 overflow-hidden">
          <InsightCardViz widget={widget} configOverride={mergedConfig} />
        </div>
      </div>

      {fullscreen && (
        <Dialog open onOpenChange={(open) => !open && setFullscreen(false)}>
          <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{widget.insight?.name || t('widget')}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              <InsightCardViz widget={widget} configOverride={mergedConfig} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
