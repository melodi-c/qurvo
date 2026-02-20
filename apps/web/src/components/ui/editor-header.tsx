import { Link } from 'react-router-dom';
import { ChevronRight, Save, AlertCircle } from 'lucide-react';
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
    <header className="flex items-center gap-2 border-b border-border bg-background px-5 h-14 flex-shrink-0">
      <nav className="flex items-center gap-1.5 min-w-0 flex-1">
        <Link
          to={backPath}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground flex-shrink-0"
        >
          {backLabel}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40 min-w-0"
        />
      </nav>

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
