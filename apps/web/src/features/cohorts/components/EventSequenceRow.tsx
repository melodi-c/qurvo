import { X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './EventSequenceRow.translations';
import type { EventSequenceCondition } from '../types';

interface EventSequenceRowProps {
  condition: EventSequenceCondition;
  onChange: (condition: EventSequenceCondition) => void;
  onRemove: () => void;
}

export function EventSequenceRow({ condition, onChange, onRemove }: EventSequenceRowProps) {
  const { t } = useLocalTranslation(translations);

  const updateStep = (idx: number, event_name: string) => {
    const steps = condition.steps.map((s, i) => (i === idx ? { ...s, event_name } : s));
    onChange({ ...condition, steps });
  };

  const removeStep = (idx: number) => {
    if (condition.steps.length <= 2) return;
    onChange({ ...condition, steps: condition.steps.filter((_, i) => i !== idx) });
  };

  const addStep = () => {
    onChange({ ...condition, steps: [...condition.steps, { event_name: '' }] });
  };

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">{t('eventSequence')}</span>
        <button type="button" onClick={onRemove} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      </div>

      {condition.steps.map((step, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <div className="flex items-center gap-2 py-0.5">
              <div className="flex-1 border-t border-border/40" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">{t('thenPerformed')}</span>
              <div className="flex-1 border-t border-border/40" />
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground w-4 text-center shrink-0">{idx + 1}</span>
            <div className="flex-1">
              <EventNameCombobox
                value={step.event_name}
                onChange={(v) => updateStep(idx, v)}
                placeholder={t('selectEvent')}
              />
            </div>
            {condition.steps.length > 2 && (
              <button type="button" onClick={() => removeStep(idx)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive shrink-0">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-full text-xs h-6" onClick={addStep}>
        <Plus className="h-3 w-3 mr-1" />{t('addStep')}
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{t('inLast')}</span>
        <Input
          type="number" min={1} max={365}
          value={condition.time_window_days}
          onChange={(e) => onChange({ ...condition, time_window_days: Number(e.target.value) })}
          className="h-8 text-xs w-16"
        />
        <span className="text-xs text-muted-foreground">{t('days')}</span>
      </div>
    </div>
  );
}
