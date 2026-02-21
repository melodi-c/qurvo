import { Button } from '@/components/ui/button';
import { Save, RotateCcw } from 'lucide-react';

interface SaveBarProps {
  onSave: () => void;
  onDiscard: () => void;
  isSaving: boolean;
}

export function SaveBar({ onSave, onDiscard, isSaving }: SaveBarProps) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50"
      style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl shadow-2xl px-4 py-3">
        <span className="text-sm text-muted-foreground">Unsaved changes</span>
        <div className="w-px h-4 bg-border" />
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={isSaving}>
          <RotateCcw className="h-3 w-3 mr-1" />
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          <Save className="h-3 w-3 mr-1" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
