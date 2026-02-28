import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './inline-edit-field.translations';

interface InlineEditFieldProps {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  isPending?: boolean;
  readOnly?: boolean;
  inputClassName?: string;
  editLabel?: string;
  saveLabel?: string;
  savingLabel?: string;
  cancelLabel?: string;
}

export function InlineEditField({
  value,
  onSave,
  isPending = false,
  readOnly = false,
  inputClassName,
  editLabel,
  saveLabel,
  savingLabel,
  cancelLabel,
}: InlineEditFieldProps) {
  const { t } = useLocalTranslation(translations);
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState('');

  const resolvedEditLabel = editLabel ?? t('edit');
  const resolvedSaveLabel = saveLabel ?? t('save');
  const resolvedSavingLabel = savingLabel ?? t('saving');
  const resolvedCancelLabel = cancelLabel ?? t('cancel');

  const startEditing = () => {
    setLocalValue(value);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const save = () => {
    if (!localValue.trim() || isPending) {return;}
    onSave(localValue);
  };

  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-2">
        <Input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className={cn('h-7 w-48 text-sm', inputClassName)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {save();}
            if (e.key === 'Escape') {cancelEditing();}
          }}
        />
        <Button
          size="xs"
          onClick={save}
          disabled={isPending || !localValue.trim()}
        >
          {isPending ? resolvedSavingLabel : resolvedSaveLabel}
        </Button>
        <Button size="xs" variant="ghost" onClick={cancelEditing} aria-label={resolvedCancelLabel}>
          {resolvedCancelLabel}
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {value}
      {!readOnly && (
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={startEditing}
          aria-label={resolvedEditLabel}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
    </span>
  );
}
