import { useCallback } from 'react';
import { Responsive as ResponsiveGridLayout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useElementWidth } from '@/hooks/use-element-width';
import { useDashboardStore, type RglItem } from '../store';
import { InsightCard } from './InsightCard';
import { DashboardEmptyState } from './DashboardEmptyState';

const BREAKPOINTS = { sm: 1024, xs: 0 };
const COLS = { sm: 24, xs: 1 };
const SCALE = 2;

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
    (currentLayout: readonly RglItem[]) =>
      updateLayout(
        currentLayout.map((l) => ({
          ...l,
          x: Math.round(l.x / SCALE),
          y: Math.round(l.y / SCALE),
          w: Math.round(l.w / SCALE),
          h: Math.round(l.h / SCALE),
        })),
      ),
    [updateLayout],
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
          <div key={widget.id} style={{ height: 320 }}>
            <InsightCard widget={widget} />
          </div>
        ))}
      </div>
    );
  }

  const smLayout = localLayout.map((l) => ({
    ...l,
    x: l.x * SCALE,
    y: l.y * SCALE,
    w: l.w * SCALE,
    h: l.h * SCALE,
    minH: 2 * SCALE,
  }));
  const xsLayout = localLayout.map((l) => ({ ...l, x: 0, w: 1, minH: 2 * SCALE }));

  return (
    <div ref={containerRef} data-editing={isEditing || undefined}>
      {width > 0 && (
        <ResponsiveGridLayout
          layouts={{ sm: smLayout, xs: xsLayout }}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={40}
          margin={[12, 12] as const}
          containerPadding={[0, 0] as const}
          width={width}
          dragConfig={{
            enabled: isEditing,
            handle: '.drag-handle',
            cancel: '.drag-cancel',
          }}
          resizeConfig={{
            enabled: isEditing,
            handles: ['s', 'e', 'se'],
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
