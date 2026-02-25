import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface InlineEditFieldProps {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  isPending?: boolean;
  readOnly?: boolean;
  inputClassName?: string;
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
  saveLabel = 'Save',
  savingLabel = 'Saving...',
  cancelLabel = 'Cancel',
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState('');

  const startEditing = () => {
    setLocalValue(value);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const save = () => {
    if (!localValue.trim() || isPending) return;
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
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancelEditing();
          }}
        />
        <Button
          size="xs"
          onClick={save}
          disabled={isPending || !localValue.trim()}
        >
          {isPending ? savingLabel : saveLabel}
        </Button>
        <Button size="xs" variant="ghost" onClick={cancelEditing} aria-label={cancelLabel}>
          {cancelLabel}
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
          aria-label="Edit"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
    </span>
  );
}
