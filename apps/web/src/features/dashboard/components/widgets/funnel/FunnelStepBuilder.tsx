import { useCallback } from 'react';
import { Plus, ArrowDown } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { QueryItemCard } from '../QueryItemCard';
import { useDragReorder } from '@/hooks/use-drag-reorder';
import { useFilterManager } from '@/hooks/use-filter-manager';
import translations from './FunnelStepBuilder.translations';
import type { FunnelStep } from '@/api/generated/Api';

interface FunnelStepBuilderProps {
  steps: FunnelStep[];
  onChange: (steps: FunnelStep[]) => void;
}

export function FunnelStepBuilder({ steps, onChange }: FunnelStepBuilderProps) {
  const { t } = useLocalTranslation(translations);
  const drag = useDragReorder(steps, onChange);

  const updateStep = useCallback(
    (i: number, patch: Partial<FunnelStep>) => {
      onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    },
    [steps, onChange],
  );

  const { addFilter, updateFilter, removeFilter } = useFilterManager(steps, updateStep);

  const addStep = () =>
    onChange([...steps, { event_name: '', label: t('stepN', { n: String(steps.length + 1) }) }]);

  const removeStep = (i: number) => {
    if (steps.length <= 2) return;
    onChange(steps.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => (
        <div key={i}>
          <QueryItemCard
            item={step}
            index={i}
            badge={
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {i + 1}
              </div>
            }
            labelPlaceholder={t('stepName')}
            canRemove={steps.length > 2}
            onLabelChange={(label) => updateStep(i, { label })}
            onEventChange={(event_name) => updateStep(i, { event_name })}
            onEventNamesChange={(event_names) => updateStep(i, { event_names: event_names.length ? event_names : undefined })}
            onRemove={() => removeStep(i)}
            onFilterAdd={() => addFilter(i)}
            onFilterChange={(fi, f) => updateFilter(i, fi, f)}
            onFilterRemove={(fi) => removeFilter(i, fi)}
            draggable
            isDragOver={drag.overIdx === i && drag.dragIdx !== null && drag.dragIdx !== i}
            onDragStart={(e) => drag.handleDragStart(i, e)}
            onDragEnd={drag.handleDragEnd}
            onDragOver={(e) => drag.handleDragOver(i, e)}
            onDragLeave={() => drag.handleDragLeave(i)}
          />

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
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('addStep')}
      </button>
    </div>
  );
}
