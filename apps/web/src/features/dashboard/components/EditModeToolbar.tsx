import { Plus, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardStore } from '../store';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './EditModeToolbar.translations';

interface EditModeToolbarProps {
  onAddInsight: () => void;
  onAddText: () => void;
}

export function EditModeToolbar({ onAddInsight, onAddText }: EditModeToolbarProps) {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const localWidgets = useDashboardStore((s) => s.localWidgets);
  const { t } = useLocalTranslation(translations);

  // Only show when editing and dashboard has widgets (empty state has its own CTAs)
  if (!isEditing || localWidgets.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40 flex gap-2"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <Button variant="secondary" size="sm" onClick={onAddInsight}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        {t('addInsight')}
      </Button>
      <Button variant="outline" size="sm" onClick={onAddText}>
        <Type className="h-3.5 w-3.5 mr-1.5" />
        {t('addText')}
      </Button>
    </div>
  );
}
