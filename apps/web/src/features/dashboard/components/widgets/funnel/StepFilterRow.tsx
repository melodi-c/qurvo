import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PropertyNameCombobox } from './PropertyNameCombobox';
import type { StepFilter, StepFilterDtoOperatorEnum } from '@/api/generated/Api';

const OPERATORS: { value: StepFilterDtoOperatorEnum; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '\u2260' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: "doesn't contain" },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' },
];

export const NO_VALUE_OPS = new Set<StepFilterDtoOperatorEnum>(['is_set', 'is_not_set']);

interface StepFilterRowProps {
  filter: StepFilter;
  onChange: (f: StepFilter) => void;
  onRemove: () => void;
  propertyNames?: string[];
}

export function StepFilterRow({ filter, onChange, onRemove, propertyNames }: StepFilterRowProps) {
  const hasValue = !NO_VALUE_OPS.has(filter.operator);

  return (
    <div className="space-y-1">
      {/* Row 1: property + delete */}
      <div className="flex items-center gap-1.5">
        {propertyNames !== undefined ? (
          <PropertyNameCombobox
            value={filter.property}
            onChange={(val) => onChange({ ...filter, property: val })}
            propertyNames={propertyNames}
            className="h-8 min-w-0 flex-1"
          />
        ) : (
          <Input
            value={filter.property}
            onChange={(e) => onChange({ ...filter, property: e.target.value })}
            placeholder="property (e.g. properties.plan)"
            className="h-8 min-w-0 flex-1 border-border/60 bg-muted/30 px-2 text-xs shadow-none font-mono"
          />
        )}
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
        <Select
          value={filter.operator}
          onValueChange={(val) =>
            onChange({ ...filter, operator: val as StepFilterDtoOperatorEnum, value: '' })
          }
        >
          <SelectTrigger size="sm" className="h-8 w-32 shrink-0 text-xs px-2 shadow-none border-border/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value} className="text-xs">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasValue && (
          <Input
            value={filter.value ?? ''}
            onChange={(e) => onChange({ ...filter, value: e.target.value })}
            placeholder="value"
            className="h-8 min-w-0 flex-1 border-border/60 bg-muted/30 px-2 text-xs shadow-none"
          />
        )}
      </div>
    </div>
  );
}
