import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useElementWidth } from '@/hooks/use-element-width';
import { useDashboardStore } from '../store';
import { WidgetCard } from './WidgetCard';

export function DashboardGrid() {
  const localWidgets = useDashboardStore((s) => s.localWidgets);
  const localLayout = useDashboardStore((s) => s.localLayout);
  const isEditing = useDashboardStore((s) => s.isEditing);
  const updateLayout = useDashboardStore((s) => s.updateLayout);
  const isMobile = useIsMobile();

  const { ref: containerRef, width } = useElementWidth();

  return (
    <div ref={containerRef}>
      {localWidgets.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center text-muted-foreground">
          {isEditing ? 'Click "Add Widget" to add your first widget' : 'No widgets yet. Click Edit to add widgets.'}
        </div>
      ) : isMobile ? (
        <div className="flex flex-col gap-3">
          {localWidgets.map((widget) => (
            <div key={widget.id} style={{ height: 320 }}>
              <WidgetCard widget={widget} />
            </div>
          ))}
        </div>
      ) : (
        <GridLayout
          layout={localLayout}
          width={width}
          gridConfig={{ cols: 12, rowHeight: 80, margin: [12, 12] as const, containerPadding: [0, 0] as const }}
          dragConfig={{ enabled: isEditing, handle: '.drag-handle' }}
          resizeConfig={{ enabled: isEditing }}
          onLayoutChange={(layout) => updateLayout(layout)}
        >
          {localWidgets.map((widget) => (
            <div key={widget.id}>
              <WidgetCard widget={widget} />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
