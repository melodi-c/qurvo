import { LayoutDashboard, Plus, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './DashboardEmptyState.translations';

interface DashboardEmptyStateProps {
  isEditing: boolean;
  onAddInsight: () => void;
  onAddText: () => void;
}

export function DashboardEmptyState({ isEditing, onAddInsight, onAddText }: DashboardEmptyStateProps) {
  const { t } = useLocalTranslation(translations);

  if (!isEditing) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
      />
    );
  }

  return (
    <div className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center gap-6">
      {/* Skeleton preview cards */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-lg opacity-20 pointer-events-none">
        <div className="h-20 rounded-lg bg-muted animate-pulse" />
        <div className="h-20 rounded-lg bg-muted animate-pulse [animation-delay:0.1s]" />
        <div className="h-20 rounded-lg bg-muted animate-pulse [animation-delay:0.2s]" />
        <div className="h-20 col-span-2 rounded-lg bg-muted animate-pulse [animation-delay:0.3s]" />
        <div className="h-20 rounded-lg bg-muted animate-pulse [animation-delay:0.15s]" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium">{t('emptyEditTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('emptyEditDescription')}</p>
      </div>
      <div className="flex gap-3">
        <Button onClick={onAddInsight}>
          <Plus className="h-4 w-4 mr-2" />
          {t('addInsight')}
        </Button>
        <Button variant="outline" onClick={onAddText}>
          <Type className="h-4 w-4 mr-2" />
          {t('addText')}
        </Button>
      </div>
    </div>
  );
}
