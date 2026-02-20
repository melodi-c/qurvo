import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GitFork, TrendingUp, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useInsights } from '@/features/insights/hooks/use-insights';
import { useAddWidget } from '../hooks/use-dashboard';
import { useDashboardStore } from '../store';
import { toast } from 'sonner';
import type { Insight } from '@/api/generated/Api';

interface AddWidgetDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddWidgetDialog({ open, onClose }: AddWidgetDialogProps) {
  const dashboardId = useDashboardStore((s) => s.dashboardId);
  const store = useDashboardStore();
  const { data: insights, isLoading } = useInsights();
  const addWidget = useAddWidget();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  const filtered = (insights ?? []).filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = async (insight: Insight) => {
    if (!dashboardId || adding) return;
    setAdding(insight.id);
    try {
      const maxY = store.localLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const layout = { x: 0, y: maxY, w: 6, h: 4 };
      const created = await addWidget.mutateAsync({
        dashboardId,
        widget: { insight_id: insight.id, layout },
      });
      store.addWidget({ ...created, layout });
      toast.success(`Added "${insight.name}" to dashboard`);
      onClose();
    } catch {
      toast.error('Failed to add widget');
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Insight to Dashboard</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search insights..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto -mx-1 px-1 space-y-1">
          {isLoading && (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {insights?.length === 0
                ? 'No insights yet. Create a trend or funnel first.'
                : 'No insights match your search.'}
            </div>
          )}

          {!isLoading && filtered.map((insight) => {
            const Icon = insight.type === 'trend' ? TrendingUp : GitFork;
            const typeLabel = insight.type === 'trend' ? 'Trend' : 'Funnel';
            return (
              <button
                key={insight.id}
                onClick={() => handleAdd(insight)}
                disabled={adding === insight.id}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted flex-shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{insight.name}</p>
                  <p className="text-xs text-muted-foreground">{typeLabel}</p>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
