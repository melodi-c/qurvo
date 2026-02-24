import type { ElementType } from 'react';
import { Filter, Plus } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { StepFilterRow } from '@/components/StepFilterRow';
import type { StepFilter } from '@/api/generated/Api';

interface FilterListSectionProps {
  icon?: ElementType;
  label: string;
  addLabel: string;
  filters: StepFilter[];
  onFiltersChange: (filters: StepFilter[]) => void;
  propertyNames?: string[];
  propertyDescriptions?: Record<string, string>;
}

export function FilterListSection({
  icon = Filter,
  label,
  addLabel,
  filters,
  onFiltersChange,
  propertyNames,
  propertyDescriptions,
}: FilterListSectionProps) {
  const addFilter = () =>
    onFiltersChange([...filters, { property: '', operator: 'eq', value: '' }]);

  const updateFilter = (i: number, f: StepFilter) =>
    onFiltersChange(filters.map((existing, idx) => (idx === i ? f : existing)));

  const removeFilter = (i: number) =>
    onFiltersChange(filters.filter((_, idx) => idx !== i));

  return (
    <section className="space-y-3">
      <SectionHeader icon={icon} label={label} />
      {filters.length > 0 && (
        <div className="space-y-2">
          {filters.map((f, i) => (
            <StepFilterRow
              key={i}
              filter={f}
              onChange={(updated) => updateFilter(i, updated)}
              onRemove={() => removeFilter(i)}
              propertyNames={propertyNames}
              propertyDescriptions={propertyDescriptions}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addFilter}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        {addLabel}
      </button>
    </section>
  );
}
