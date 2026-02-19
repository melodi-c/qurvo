import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, ArrowDown } from 'lucide-react';
import type { FunnelStep } from '@/features/dashboard/types';

interface FunnelStepBuilderProps {
  steps: FunnelStep[];
  onChange: (steps: FunnelStep[]) => void;
}

export function FunnelStepBuilder({ steps, onChange }: FunnelStepBuilderProps) {
  const updateStep = (i: number, field: keyof FunnelStep, value: string) => {
    const next = steps.map((s, idx) => (idx === i ? { ...s, [field]: value } : s));
    onChange(next);
  };

  const addStep = () =>
    onChange([...steps, { event_name: '', label: `Step ${steps.length + 1}` }]);

  const removeStep = (i: number) => {
    if (steps.length <= 2) return;
    onChange(steps.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground mb-2 block font-medium">Funnel Steps</label>
      {steps.map((step, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground w-5 text-right mt-2 flex-shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 space-y-1">
              <Input
                value={step.event_name}
                onChange={(e) => updateStep(i, 'event_name', e.target.value)}
                placeholder="event_name (e.g. $pageview)"
                className="text-sm h-8"
              />
              <Input
                value={step.label}
                onChange={(e) => updateStep(i, 'label', e.target.value)}
                placeholder="Label (e.g. Landing Page)"
                className="text-xs h-7 text-muted-foreground"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeStep(i)}
              disabled={steps.length <= 2}
              className="h-8 w-8 mt-0.5 text-muted-foreground hover:text-destructive flex-shrink-0"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {i < steps.length - 1 && (
            <div className="flex items-center ml-7">
              <ArrowDown className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addStep}
        className="mt-2 text-xs h-7"
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Step
      </Button>
    </div>
  );
}
