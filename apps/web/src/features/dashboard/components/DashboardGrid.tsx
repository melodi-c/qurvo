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
const COLS = { sm: 12, xs: 1 };

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

  const smLayout = localLayout;
  const xsLayout = localLayout.map((l) => ({ ...l, x: 0, w: 1 }));

  return (
    <div ref={containerRef} data-editing={isEditing || undefined}>
      {width > 0 && (
        <ResponsiveGridLayout
          layouts={{ sm: smLayout, xs: xsLayout }}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={80}
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
