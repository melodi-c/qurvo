import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { extractApiErrorMessage } from '@/lib/utils';
import { ANNOTATION_PRESET_COLORS } from '@/lib/chart-colors';
import translations from './annotation-dialog.translations';
import type { Annotation, CreateAnnotation } from '@/api/generated/Api';

interface AnnotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  annotation?: Annotation;
  onSave: (data: CreateAnnotation) => Promise<void>;
}

export function AnnotationDialog({
  open,
  onOpenChange,
  initialDate,
  annotation,
  onSave,
}: AnnotationDialogProps) {
  const { t } = useLocalTranslation(translations);

  const isEdit = !!annotation;

  const [date, setDate] = useState(initialDate ?? '');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(ANNOTATION_PRESET_COLORS[4]);
  const [isPending, setIsPending] = useState(false);

  // Reset form when dialog opens / annotation changes
  useEffect(() => {
    if (open) {
      setDate(annotation?.date ?? initialDate ?? '');
      setLabel(annotation?.label ?? '');
      setDescription(annotation?.description ?? '');
      setColor(annotation?.color ?? ANNOTATION_PRESET_COLORS[4]);
    }
  }, [open, annotation, initialDate]);

  const handleSave = useCallback(async () => {
    if (!date || !label.trim()) return;
    setIsPending(true);
    try {
      await onSave({ date, label: label.trim(), description: description.trim() || undefined, color });
      onOpenChange(false);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('save')));
    } finally {
      setIsPending(false);
    }
  }, [date, label, description, color, onSave, onOpenChange, t]);

  const isValid = !!date && label.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editTitle') : t('addTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Date */}
          <div className="flex flex-col gap-1.5">
            <Label>{t('dateLabel')}</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {/* Label */}
          <div className="flex flex-col gap-1.5">
            <Label>{t('labelLabel')}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('labelPlaceholder')}
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label>{t('descriptionLabel')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={2}
              maxLength={1000}
            />
          </div>

          {/* Color swatches */}
          <div className="flex flex-col gap-1.5">
            <Label>{t('colorLabel')}</Label>
            <div className="flex flex-wrap gap-2">
              {ANNOTATION_PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="size-6 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'white' : 'transparent',
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isPending}>
            {isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            {isPending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
