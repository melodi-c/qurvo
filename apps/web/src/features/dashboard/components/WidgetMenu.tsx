import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardStore } from '../store';

export function WidgetMenu({ widgetId }: { widgetId: string }) {
  const [open, setOpen] = useState(false);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const setEditingWidget = useDashboardStore((s) => s.setEditingWidget);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal className="h-3 w-3" />
      </Button>
      {open && (
        <div className="absolute right-0 top-7 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-32">
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors text-left"
            onClick={() => {
              setEditingWidget(widgetId);
              setOpen(false);
            }}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-muted transition-colors text-left"
            onClick={() => {
              removeWidget(widgetId);
              setOpen(false);
            }}
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
