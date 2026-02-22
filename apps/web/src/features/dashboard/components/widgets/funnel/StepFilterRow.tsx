import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { PropertyNameCombobox } from './PropertyNameCombobox';
import translations from './StepFilterRow.translations';
import type { StepFilter, StepFilterDtoOperatorEnum } from '@/api/generated/Api';

export const NO_VALUE_OPS = new Set<StepFilterDtoOperatorEnum>(['is_set', 'is_not_set']);

interface StepFilterRowProps {
  filter: StepFilter;
  onChange: (f: StepFilter) => void;
  onRemove: () => void;
  propertyNames?: string[];
}

export function StepFilterRow({ filter, onChange, onRemove, propertyNames }: StepFilterRowProps) {
  const { t } = useLocalTranslation(translations);
  const hasValue = !NO_VALUE_OPS.has(filter.operator);

  const operators = useMemo<{ value: StepFilterDtoOperatorEnum; label: string }[]>(() => [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '\u2260' },
    { value: 'contains', label: t('contains') },
    { value: 'not_contains', label: t('doesNotContain') },
    { value: 'is_set', label: t('isSet') },
    { value: 'is_not_set', label: t('isNotSet') },
  ], [t]);

  return (
    <div className="space-y-1">
      {/* Row 1: property + delete (unified container) */}
      <div className="flex items-center rounded-sm border border-border/60 bg-muted/30">
        {propertyNames !== undefined ? (
          <PropertyNameCombobox
            value={filter.property}
            onChange={(val) => onChange({ ...filter, property: val })}
            propertyNames={propertyNames}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent"
          />
        ) : (
          <Input
            value={filter.property}
            onChange={(e) => onChange({ ...filter, property: e.target.value })}
            placeholder={t('propertyPlaceholder')}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent shadow-none px-2 text-xs font-mono"
          />
        )}
        <button
          type="button"
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Row 2: operator + value */}
      <div className="flex items-center gap-1.5">
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
            {operators.map((op) => (
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
            placeholder={t('valuePlaceholder')}
            className="h-8 min-w-0 flex-1 px-2 text-xs shadow-none"
          />
        )}
      </div>
    </div>
  );
}
