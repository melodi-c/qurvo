import { Link } from 'react-router-dom';
import { ChevronRight, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './editor-header.translations';

interface EditorHeaderProps {
  backPath: string;
  backLabel: string;
  name: string;
  onNameChange: (name: string) => void;
  placeholder: string;
  description?: string;
  onDescriptionChange?: (description: string) => void;
  descriptionPlaceholder?: string;
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
  description,
  onDescriptionChange,
  descriptionPlaceholder,
  onSave,
  isSaving,
  isValid,
  saveError,
}: EditorHeaderProps) {
  const { t } = useLocalTranslation(translations);
  const hasDescriptionField = onDescriptionChange !== undefined;

  return (
    <header className="flex flex-col gap-0 border-b border-border bg-background flex-shrink-0">
      <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:px-5 lg:py-0 lg:h-14">
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
            className="flex-1 bg-transparent text-base lg:text-sm font-medium outline-none placeholder:text-muted-foreground/40 min-w-0"
          />
        </nav>

        <div className="self-end lg:self-auto ml-auto flex items-center gap-2 flex-shrink-0">
          {saveError && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground" disabled={isSaving}>
            <Link to={backPath}>{t('discard')}</Link>
          </Button>
          <Button size="sm" onClick={onSave} disabled={!isValid || isSaving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>

      {hasDescriptionField && (
        <div className="border-t border-border/40 px-5 py-2">
          <textarea
            value={description ?? ''}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder={descriptionPlaceholder ?? t('addDescription')}
            rows={1}
            maxLength={1000}
            className="w-full resize-none bg-transparent text-base lg:text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/30 leading-relaxed"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${el.scrollHeight}px`;
            }}
          />
        </div>
      )}
    </header>
  );
}
