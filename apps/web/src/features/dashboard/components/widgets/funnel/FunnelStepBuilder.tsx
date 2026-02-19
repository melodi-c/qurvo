import { useRef, useState } from 'react';
import { X, Plus, ArrowDown, Filter, GripVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EventNameCombobox } from './EventNameCombobox';
import { StepFilterRow } from './StepFilterRow';
import type { FunnelStep, StepFilter } from '@/api/generated/Api';

interface FunnelStepBuilderProps {
  steps: FunnelStep[];
  onChange: (steps: FunnelStep[]) => void;
}

export function FunnelStepBuilder({ steps, onChange }: FunnelStepBuilderProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

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

  const handleDragStart = (i: number, e: React.DragEvent<HTMLDivElement>) => {
    setDragIdx(i);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    // Make the card semi-transparent while dragging
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4';
    });
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const next = [...steps];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      onChange(next);
    }
    setDragIdx(null);
    setOverIdx(null);
    dragNode.current = null;
  };

  const handleDragOver = (i: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx !== null && i !== overIdx) {
      setOverIdx(i);
    }
  };

  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => (
        <div key={i}>
          {/* Step card */}
          <div
            className={`group rounded-xl border bg-card px-3 py-2.5 transition-colors ${
              overIdx === i && dragIdx !== null && dragIdx !== i
                ? 'border-primary/50 bg-primary/5'
                : 'border-border hover:border-border/80'
            }`}
            draggable
            onDragStart={(e) => handleDragStart(i, e)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(i, e)}
            onDragLeave={() => { if (overIdx === i) setOverIdx(null); }}
          >
            {/* Header: grip + number + label + delete */}
            <div className="flex items-center gap-1.5 border-b border-border/40 pb-2 mb-2">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing" />
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {i + 1}
              </div>
              <Input
                value={step.label}
                onChange={(e) => updateStep(i, { label: e.target.value })}
                placeholder="Step name"
                className="h-6 flex-1 border-0 bg-transparent text-xs font-medium shadow-none p-0 focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => removeStep(i)}
                disabled={steps.length <= 2}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Event name */}
            <div className="px-1">
              <EventNameCombobox
                value={step.event_name}
                onChange={(val) => updateStep(i, { event_name: val })}
              />
            </div>

            {/* Filters */}
            {(step.filters ?? []).length > 0 && (
              <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2 px-1">
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
              className="mt-2 px-1 flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
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
