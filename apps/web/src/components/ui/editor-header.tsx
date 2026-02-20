import { Link } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EditorHeaderProps {
  backPath: string;
  backLabel: string;
  name: string;
  onNameChange: (name: string) => void;
  placeholder: string;
  onSave: () => void;
  isSaving: boolean;
  isValid: boolean;
  saveError?: string | null;
}

export function EditorHeader({
  backPath,
  backLabel,
  name,
  onNameChange,
  placeholder,
  onSave,
  isSaving,
  isValid,
  saveError,
}: EditorHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-background px-5 h-14 flex-shrink-0">
      <Link
        to={backPath}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{backLabel}</span>
      </Link>

      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground/40 min-w-0"
      />

      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        {saveError && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground" disabled={isSaving}>
          <Link to={backPath}>Discard</Link>
        </Button>
        <Button size="sm" onClick={onSave} disabled={!isValid || isSaving}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {isSaving ? 'Saving\u2026' : 'Save'}
        </Button>
      </div>
    </header>
  );
}
