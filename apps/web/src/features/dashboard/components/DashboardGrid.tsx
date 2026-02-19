import { useRef, useEffect, useState } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useDashboardStore } from '../store';
import { WidgetCard } from './WidgetCard';

function useElementWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return width;
}

export function DashboardGrid() {
  const localWidgets = useDashboardStore((s) => s.localWidgets);
  const localLayout = useDashboardStore((s) => s.localLayout);
  const isEditing = useDashboardStore((s) => s.isEditing);
  const updateLayout = useDashboardStore((s) => s.updateLayout);

  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);

  if (localWidgets.length === 0) {
    return (
      <div ref={containerRef} className="border border-dashed border-border rounded-xl p-12 text-center text-muted-foreground">
        {isEditing ? 'Click "Add Widget" to add your first widget' : 'No widgets yet. Click Edit to add widgets.'}
      </div>
    );
  }

  return (
    <div ref={containerRef}>
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
    </div>
  );
}
