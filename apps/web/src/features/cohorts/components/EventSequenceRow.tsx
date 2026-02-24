import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { ConditionRowWrapper } from './ConditionRowWrapper';
import { TimeWindowInput } from './TimeWindowInput';
import translations from './EventSequenceRow.translations';
import type { EventSequenceCondition, NotPerformedEventSequenceCondition } from '../types';

type SequenceCondition = EventSequenceCondition | NotPerformedEventSequenceCondition;

interface EventSequenceRowProps {
  condition: SequenceCondition;
  onChange: (condition: SequenceCondition) => void;
  onRemove: () => void;
  variant: 'performed' | 'not_performed';
}

export function EventSequenceRow({ condition, onChange, onRemove, variant }: EventSequenceRowProps) {
  const { t } = useLocalTranslation(translations);

  const updateStep = (idx: number, event_name: string) => {
    const steps = condition.steps.map((s, i) => (i === idx ? { ...s, event_name } : s));
    onChange({ ...condition, steps } as SequenceCondition);
  };

  const removeStep = (idx: number) => {
    if (condition.steps.length <= 2) return;
    onChange({ ...condition, steps: condition.steps.filter((_, i) => i !== idx) } as SequenceCondition);
  };

  const addStep = () => {
    onChange({ ...condition, steps: [...condition.steps, { event_name: '' }] } as SequenceCondition);
  };

  const label = variant === 'performed' ? t('eventSequence') : t('notPerformedEventSequence');
  const labelColor = variant === 'performed' ? 'text-amber-400' : 'text-red-400';

  return (
    <ConditionRowWrapper label={label} labelColor={labelColor} onRemove={onRemove}>
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

      <TimeWindowInput
        value={condition.time_window_days}
        onChange={(time_window_days) => onChange({ ...condition, time_window_days } as SequenceCondition)}
      />
    </ConditionRowWrapper>
  );
}
