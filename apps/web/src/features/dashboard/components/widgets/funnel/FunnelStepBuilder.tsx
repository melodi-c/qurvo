import { X, Plus, ArrowDown, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EventNameCombobox } from './EventNameCombobox';
import { StepFilterRow } from './StepFilterRow';
import type { FunnelStep, StepFilter } from '@/features/dashboard/types';

interface FunnelStepBuilderProps {
  steps: FunnelStep[];
  onChange: (steps: FunnelStep[]) => void;
}

export function FunnelStepBuilder({ steps, onChange }: FunnelStepBuilderProps) {
  const updateStep = (i: number, patch: Partial<FunnelStep>) => {
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const addStep = () =>
    onChange([...steps, { event_name: '', label: `Step ${steps.length + 1}` }]);

  const removeStep = (i: number) => {
    if (steps.length <= 2) return;
    onChange(steps.filter((_, idx) => idx !== i));
  };

  const addFilter = (i: number) => {
    const filters: StepFilter[] = [
      ...(steps[i].filters ?? []),
      { property: '', operator: 'eq', value: '' },
    ];
    updateStep(i, { filters });
  };

  const updateFilter = (i: number, j: number, filter: StepFilter) => {
    const filters = (steps[i].filters ?? []).map((f, idx) => (idx === j ? filter : f));
    updateStep(i, { filters });
  };

  const removeFilter = (i: number, j: number) => {
    const filters = (steps[i].filters ?? []).filter((_, idx) => idx !== j);
    updateStep(i, { filters });
  };

  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => (
        <div key={i}>
          {/* Step card */}
          <div className="group rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-border/80">
            <div className="flex items-start gap-3">
              {/* Number badge */}
              <div className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {i + 1}
              </div>

              {/* Inputs */}
              <div className="min-w-0 flex-1 space-y-1">
                <EventNameCombobox
                  value={step.event_name}
                  onChange={(val) => updateStep(i, { event_name: val })}
                />
                <Input
                  value={step.label}
                  onChange={(e) => updateStep(i, { label: e.target.value })}
                  placeholder="Display name"
                  className="h-6 border-transparent bg-transparent text-xs text-muted-foreground shadow-none hover:border-border focus-visible:border-border focus-visible:bg-background"
                />
              </div>

              {/* Delete — appears on hover */}
              <button
                type="button"
                onClick={() => removeStep(i)}
                disabled={steps.length <= 2}
                className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Filters */}
            {(step.filters ?? []).length > 0 && (
              <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2">
                {step.filters!.map((filter, j) => (
                  <StepFilterRow
                    key={j}
                    filter={filter}
                    onChange={(f) => updateFilter(i, j, f)}
                    onRemove={() => removeFilter(i, j)}
                  />
                ))}
              </div>
            )}

            {/* Add filter button */}
            <button
              type="button"
              onClick={() => addFilter(i)}
              className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              <Filter className="h-3 w-3" />
              Add filter
            </button>
          </div>

          {/* Connector arrow */}
          {i < steps.length - 1 && (
            <div className="flex justify-center py-0.5">
              <ArrowDown className="h-4 w-4 text-muted-foreground/30" />
            </div>
          )}
        </div>
      ))}

      {/* Add step */}
      <button
        type="button"
        onClick={addStep}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add step
      </button>
    </div>
  );
}
