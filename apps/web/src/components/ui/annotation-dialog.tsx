import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { extractApiErrorMessage } from '@/lib/utils';
import { ANNOTATION_PRESET_COLORS } from '@/lib/chart-colors';
import translations from './annotation-dialog.translations';
import type { Annotation, CreateAnnotation, CreateAnnotationDtoScopeEnum } from '@/api/generated/Api';

interface AnnotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  annotation?: Annotation;
  onSave: (data: CreateAnnotation) => Promise<void>;
  /** When provided, shows scope selector. Null means insight is not yet saved. */
  insightId?: string | null;
}

export function AnnotationDialog({
  open,
  onOpenChange,
  initialDate,
  annotation,
  onSave,
  insightId,
}: AnnotationDialogProps) {
  const { t } = useLocalTranslation(translations);

  const isEdit = !!annotation;
  const showScopeSelector = insightId !== undefined;
  const insightSaved = !!insightId;

  const [date, setDate] = useState(initialDate ?? '');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(ANNOTATION_PRESET_COLORS[4]);
  const [scope, setScope] = useState<CreateAnnotationDtoScopeEnum>('project');
  const [isPending, setIsPending] = useState(false);

  // Reset form when dialog opens / annotation changes
  useEffect(() => {
    if (open) {
      setDate(annotation?.date ?? initialDate ?? '');
      setLabel(annotation?.label ?? '');
      setDescription(annotation?.description ?? '');
      setColor(annotation?.color ?? ANNOTATION_PRESET_COLORS[4]);
      setScope(annotation?.scope ?? 'project');
    }
  }, [open, annotation, initialDate]);

  const handleScopeChange = useCallback((value: CreateAnnotationDtoScopeEnum) => {
    // Don't allow insight scope if insight is not saved
    if (value === 'insight' && !insightSaved) {return;}
    setScope(value);
  }, [insightSaved]);

  const handleSave = useCallback(async () => {
    if (!date || !label.trim()) {return;}
    setIsPending(true);
    try {
      const data: CreateAnnotation = {
        date,
        label: label.trim(),
        description: description.trim() || undefined,
        color,
      };
      if (showScopeSelector) {
        data.scope = scope;
        if (scope === 'insight' && insightId) {
          data.insight_id = insightId;
        }
      }
      await onSave(data);
      onOpenChange(false);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('save')));
    } finally {
      setIsPending(false);
    }
  }, [date, label, description, color, scope, insightId, showScopeSelector, onSave, onOpenChange, t]);

  const isValid = !!date && label.trim().length > 0;

  const scopeOptions = useMemo(() => [
    { label: t('scopeProject'), value: 'project' as const },
    { label: t('scopeInsight'), value: 'insight' as const },
  ], [t]);

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

          {/* Scope selector — only in insight editor context */}
          {showScopeSelector && (
            <div className="flex flex-col gap-1.5">
              <Label>{t('scopeLabel')}</Label>
              {insightSaved ? (
                <PillToggleGroup
                  options={scopeOptions}
                  value={scope}
                  onChange={handleScopeChange}
                />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <PillToggleGroup
                        options={scopeOptions}
                        value="project"
                        onChange={() => {}}
                        className="pointer-events-none opacity-60"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{t('scopeInsightDisabled')}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}

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
