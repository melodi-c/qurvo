import { useCallback, useState } from 'react';
import { useDashboardStore } from '../store';
import { applyFilterOverrides } from '../lib/filter-overrides';
import { InsightCardHeader } from './InsightCardHeader';
import { InsightCardDetails } from './InsightCardDetails';
import { InsightCardViz } from './InsightCardViz';
import type { Widget } from '@/api/generated/Api';

interface InsightCardProps {
  widget: Widget;
}

export function InsightCard({ widget }: InsightCardProps) {
  const filterOverrides = useDashboardStore((s) => s.filterOverrides);
  const requestTextFocus = useDashboardStore((s) => s.requestTextFocus);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isTextTile = !widget.insight;
  const baseConfig = widget.insight?.config as Record<string, any> | undefined;

  // Apply dashboard-level filter overrides (date + property filters)
  const mergedConfig = baseConfig
    ? applyFilterOverrides(baseConfig, filterOverrides)
    : baseConfig;

  const handleToggleDetails = useCallback(() => setDetailsOpen((v) => !v), []);
  const handleEditText = useCallback(() => requestTextFocus(widget.id), [requestTextFocus, widget.id]);

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <InsightCardHeader
        widget={widget}
        detailsOpen={detailsOpen}
        onToggleDetails={handleToggleDetails}
        onEditText={isTextTile ? handleEditText : undefined}
      />

      {detailsOpen && !isTextTile && mergedConfig && (
        <InsightCardDetails config={mergedConfig} filterOverrides={filterOverrides} />
      )}

      <div className="flex-1 p-3 min-h-0">
        <InsightCardViz widget={widget} configOverride={mergedConfig} />
      </div>
    </div>
  );
}
