import { useCallback, useMemo } from 'react';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useElementWidth } from '@/hooks/use-element-width';
import { useDashboardStore, type RglItem } from '../store';
import { InsightCard } from './InsightCard';
import { DashboardEmptyState } from './DashboardEmptyState';
import type { Widget } from '@/api/generated/Api';

const BREAKPOINTS = { sm: 1024, xs: 0 };
const COLS = { sm: 24, xs: 1 };
const GRID_ROW_HEIGHT = 40;

function getWidgetMobileHeight(widget: Widget): number {
  if (widget.insight?.type === 'retention') return 440;
  if (!widget.insight) return 200;
  return 320;
}
const GRID_MARGIN: [number, number] = [12, 12];
const GRID_CONTAINER_PADDING: [number, number] = [0, 0];
const RESIZE_HANDLES = ['s', 'e', 'se'] as const;

interface DashboardGridProps {
  onAddInsight: () => void;
  onAddText: () => void;
}

export function DashboardGrid({ onAddInsight, onAddText }: DashboardGridProps) {
  const localWidgets = useDashboardStore((s) => s.localWidgets);
  const localLayout = useDashboardStore((s) => s.localLayout);
  const isEditing = useDashboardStore((s) => s.isEditing);
  const updateLayout = useDashboardStore((s) => s.updateLayout);
  const isMobile = useIsMobile();
  const { ref: containerRef, width } = useElementWidth();
  const handleLayoutChange = useCallback(
    (currentLayout: readonly RglItem[]) => updateLayout(currentLayout),
    [updateLayout],
  );
  const smLayout = useMemo(() => localLayout.map((l) => ({ ...l, minH: 4 })), [localLayout]);
  const xsLayout = useMemo(
    () => localLayout.map((l) => ({ ...l, x: 0, w: 1, minH: 4 })),
    [localLayout],
  );

  if (localWidgets.length === 0) {
    return (
      <DashboardEmptyState
        isEditing={isEditing}
        onAddInsight={onAddInsight}
        onAddText={onAddText}
      />
    );
  }

  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        {localWidgets.map((widget) => (
          <div key={widget.id} style={{ minHeight: getWidgetMobileHeight(widget) }}>
            <InsightCard widget={widget} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} data-editing={isEditing || undefined}>
      {width > 0 && (
        <ResponsiveGridLayout
          layouts={{ sm: smLayout, xs: xsLayout }}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={GRID_ROW_HEIGHT}
          margin={GRID_MARGIN}
          containerPadding={GRID_CONTAINER_PADDING}
          width={width}
          dragConfig={{
            enabled: isEditing,
            handle: '.drag-handle',
            cancel: '.drag-cancel',
          }}
          resizeConfig={{
            enabled: isEditing,
            handles: RESIZE_HANDLES,
          }}
          onLayoutChange={handleLayoutChange}
        >
          {localWidgets.map((widget) => (
            <div
              key={widget.id}
              style={
                !isEditing
                  ? { contentVisibility: 'auto' as const, containIntrinsicSize: '0 320px' }
                  : undefined
              }
            >
              <InsightCard widget={widget} />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
