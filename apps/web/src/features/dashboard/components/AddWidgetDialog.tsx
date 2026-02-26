import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { InsightTypeIcon } from '@/features/insights/components/InsightTypeIcon';
import { useInsights } from '@/features/insights/hooks/use-insights';
import { useDashboardStore } from '../store';
import { DEFAULT_WIDGET_SIZE, DEFAULT_FALLBACK_SIZE } from '../lib/default-sizes';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './AddWidgetDialog.translations';
import type { Insight, InsightType } from '@/api/generated/Api';

interface AddWidgetDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddWidgetDialog({ open, onClose }: AddWidgetDialogProps) {
  const { t } = useLocalTranslation(translations);
  const store = useDashboardStore();
  const { data: insights, isLoading } = useInsights();
  const [search, setSearch] = useState('');

  const filtered = (insights ?? []).filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = (insight: Insight) => {
    const maxY = store.localLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
    const size = DEFAULT_WIDGET_SIZE[insight.type] ?? DEFAULT_FALLBACK_SIZE;
    const layout = { x: 0, y: maxY, ...size };

    const tempId = `temp-${crypto.randomUUID()}`;
    store.addWidget({
      id: tempId,
      dashboard_id: store.dashboardId ?? '',
      insight_id: insight.id,
      insight,
      layout,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md flex flex-col max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="min-h-0 overflow-y-auto -mx-1 px-1 space-y-1">
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
                ? t('noInsightsYet')
                : t('noMatch')}
            </div>
          )}

          {!isLoading && filtered.map((insight) => {
            const typeKeyMap: Record<string, 'typeTrend' | 'typeFunnel' | 'typeRetention' | 'typeLifecycle' | 'typeStickiness' | 'typePaths'> = {
              trend: 'typeTrend', funnel: 'typeFunnel', retention: 'typeRetention',
              lifecycle: 'typeLifecycle', stickiness: 'typeStickiness', paths: 'typePaths',
            };
            const typeLabel = t(typeKeyMap[insight.type] ?? 'typeTrend');
            return (
              <button
                key={insight.id}
                onClick={() => handleAdd(insight)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted flex-shrink-0">
                  <InsightTypeIcon type={insight.type as InsightType} />
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
