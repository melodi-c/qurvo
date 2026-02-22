import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PropertyNameCombobox } from '@/features/dashboard/components/widgets/funnel/PropertyNameCombobox';
import { usePersonPropertyNames } from '@/pages/persons/use-person-property-names';

export interface PropertyCondition {
  type: 'person_property';
  property: string;
  operator: 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';
  value?: string;
}

const OPERATORS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' },
] as const;

interface PropertyConditionRowProps {
  condition: PropertyCondition;
  onChange: (condition: PropertyCondition) => void;
  onRemove: () => void;
}

export function PropertyConditionRow({ condition, onChange, onRemove }: PropertyConditionRowProps) {
  const { data: propertyNames = [] } = usePersonPropertyNames();
  const needsValue = !['is_set', 'is_not_set'].includes(condition.operator);

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Person property</span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <PropertyNameCombobox
        value={condition.property}
        onChange={(v) => onChange({ ...condition, property: v })}
        propertyNames={propertyNames}
        className="h-8 min-w-0"
      />

      <div className="flex gap-2">
        <Select
          value={condition.operator}
          onValueChange={(v) => onChange({ ...condition, operator: v as PropertyCondition['operator'] })}
        >
          <SelectTrigger size="sm" className="h-8 text-xs flex-1">
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

        {needsValue && (
          <Input
            value={condition.value ?? ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="value"
            className="h-8 text-xs flex-1"
          />
        )}
      </div>
    </div>
  );
}
