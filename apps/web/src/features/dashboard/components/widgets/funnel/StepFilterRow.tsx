import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { StepFilter, FilterOperator } from '@/features/dashboard/types';

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: "doesn't contain" },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' },
];

const NO_VALUE_OPS = new Set<FilterOperator>(['is_set', 'is_not_set']);

interface StepFilterRowProps {
  filter: StepFilter;
  onChange: (f: StepFilter) => void;
  onRemove: () => void;
}

export function StepFilterRow({ filter, onChange, onRemove }: StepFilterRowProps) {
  const hasValue = !NO_VALUE_OPS.has(filter.operator);

  return (
    <div className="space-y-1">
      {/* Row 1: property + delete */}
      <div className="flex items-center gap-1.5">
        <Input
          value={filter.property}
          onChange={(e) => onChange({ ...filter, property: e.target.value })}
          placeholder="property (e.g. properties.plan)"
          className="h-6 min-w-0 flex-1 border-border/60 bg-muted/30 px-2 text-xs shadow-none font-mono"
        />
        <button
          type="button"
          onClick={onRemove}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Row 2: operator + value */}
      <div className="flex items-center gap-1.5 pr-[26px]">
        <select
          value={filter.operator}
          onChange={(e) =>
            onChange({ ...filter, operator: e.target.value as FilterOperator, value: '' })
          }
          className="h-6 w-32 shrink-0 rounded-sm border border-border/60 bg-background px-1.5 text-xs text-foreground outline-none focus:border-ring cursor-pointer"
        >
          {OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
        {hasValue && (
          <Input
            value={filter.value}
            onChange={(e) => onChange({ ...filter, value: e.target.value })}
            placeholder="value"
            className="h-6 min-w-0 flex-1 border-border/60 bg-muted/30 px-2 text-xs shadow-none"
          />
        )}
      </div>
    </div>
  );
}
