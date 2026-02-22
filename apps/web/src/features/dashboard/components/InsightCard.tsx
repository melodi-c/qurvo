import { useCallback, useState } from 'react';
import { useDashboardStore } from '../store';
import { applyDateOverride } from '../lib/filter-overrides';
import { InsightCardHeader } from './InsightCardHeader';
import { InsightCardDetails } from './InsightCardDetails';
import { InsightCardViz } from './InsightCardViz';
import type { Widget } from '@/api/generated/Api';

interface InsightCardProps {
  widget: Widget;
}

export function InsightCard({ widget }: InsightCardProps) {
  const filterOverrides = useDashboardStore((s) => s.filterOverrides);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const isTextTile = !widget.insight;
  const baseConfig = widget.insight?.config as Record<string, any> | undefined;

  // Apply dashboard-level date overrides if the config has date fields
  const mergedConfig =
    baseConfig && 'date_from' in baseConfig && 'date_to' in baseConfig
      ? applyDateOverride(baseConfig as { date_from: string; date_to: string } & Record<string, any>, filterOverrides)
      : baseConfig;

  const handleToggleDetails = useCallback(() => setDetailsOpen((v) => !v), []);

  // Text editing happens inline via TextTileViz in edit mode.
  // The "Edit text" menu item is a no-op hint for now (text tiles auto-edit in edit mode).

  return (
    <div className="h-full flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <InsightCardHeader
        widget={widget}
        detailsOpen={detailsOpen}
        onToggleDetails={handleToggleDetails}
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
