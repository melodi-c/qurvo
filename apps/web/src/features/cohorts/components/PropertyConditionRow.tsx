import { useMemo, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PropertyNameCombobox } from '@/components/PropertyNameCombobox';
import { usePersonPropertyNames } from '@/hooks/use-person-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { ConditionRowWrapper } from './ConditionRowWrapper';
import translations from './PropertyConditionRow.translations';
import type { PropertyCondition, CohortPropertyOperator } from '../types';

interface PropertyConditionRowProps {
  condition: PropertyCondition;
  onChange: (condition: PropertyCondition) => void;
  onRemove: () => void;
}

export function PropertyConditionRow({ condition, onChange, onRemove }: PropertyConditionRowProps) {
  const { t } = useLocalTranslation(translations);
  const { data: propertyNames = [], descriptions } = usePersonPropertyNames();

  const isNoValueOp = condition.operator === 'is_set' || condition.operator === 'is_not_set';
  const isMultiValueOp = condition.operator === 'in' || condition.operator === 'not_in'
    || condition.operator === 'contains_multi' || condition.operator === 'not_contains_multi';
  const isRangeOp = condition.operator === 'between' || condition.operator === 'not_between';
  const isDateOp = condition.operator === 'is_date_before'
    || condition.operator === 'is_date_after' || condition.operator === 'is_date_exact';
  const needsSingleValue = !isNoValueOp && !isMultiValueOp && !isRangeOp && !isDateOp;

  const operators = useMemo(() => [
    { value: 'eq', label: t('equals') },
    { value: 'neq', label: t('notEquals') },
    { value: 'contains', label: t('contains') },
    { value: 'not_contains', label: t('notContains') },
    { value: 'contains_multi', label: t('containsMulti') },
    { value: 'not_contains_multi', label: t('notContainsMulti') },
    { value: 'in', label: t('in') },
    { value: 'not_in', label: t('notIn') },
    { value: 'is_set', label: t('isSet') },
    { value: 'is_not_set', label: t('isNotSet') },
    { value: 'gt', label: t('greaterThan') },
    { value: 'lt', label: t('lessThan') },
    { value: 'gte', label: t('greaterOrEqual') },
    { value: 'lte', label: t('lessOrEqual') },
    { value: 'between', label: t('between') },
    { value: 'not_between', label: t('notBetween') },
    { value: 'regex', label: t('matchesRegex') },
    { value: 'not_regex', label: t('notMatchesRegex') },
    { value: 'is_date_before', label: t('isDateBefore') },
    { value: 'is_date_after', label: t('isDateAfter') },
    { value: 'is_date_exact', label: t('isDateExact') },
  ] as const, [t]);

  const handleOperatorChange = useCallback((v: string) => {
    const op = v as CohortPropertyOperator;
    const isNewMulti = op === 'in' || op === 'not_in'
      || op === 'contains_multi' || op === 'not_contains_multi';
    const isNewRange = op === 'between' || op === 'not_between';
    const isNewDate = op === 'is_date_before' || op === 'is_date_after' || op === 'is_date_exact';

    if (isNewMulti) {
      const currentVal = condition.value?.trim();
      onChange({ ...condition, operator: op, values: currentVal ? [currentVal] : [], value: undefined });
    } else if (isNewRange) {
      onChange({ ...condition, operator: op, values: ['', ''], value: undefined });
    } else if (isNewDate) {
      onChange({ ...condition, operator: op, value: condition.value ?? '', values: undefined });
    } else {
      const firstVal = condition.values?.[0] ?? condition.value ?? '';
      onChange({ ...condition, operator: op, value: firstVal, values: undefined });
    }
  }, [condition, onChange]);

  return (
    <ConditionRowWrapper label={t('personProperty')} labelColor="text-blue-400" onRemove={onRemove}>
      <PropertyNameCombobox
        value={condition.property}
        onChange={(v) => onChange({ ...condition, property: v })}
        propertyNames={propertyNames}
        descriptions={descriptions}
        className="h-8 min-w-0"
      />

      <div className="flex gap-2">
        <Select
          value={condition.operator}
          onValueChange={handleOperatorChange}
        >
          <SelectTrigger size="sm" className="h-8 text-xs flex-1">
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

        {needsSingleValue && (
          <Input
            value={condition.value ?? ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder={t('valuePlaceholder')}
            className="h-8 text-xs flex-1"
          />
        )}
      </div>

      {isMultiValueOp && (
        <MultiValueInput
          values={condition.values ?? []}
          onChange={(values) => onChange({ ...condition, values })}
          placeholder={t('valuesPlaceholder')}
        />
      )}

      {isRangeOp && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={condition.values?.[0] ?? ''}
            onChange={(e) => onChange({ ...condition, values: [e.target.value, condition.values?.[1] ?? ''] })}
            placeholder={t('minPlaceholder')}
            className="h-8 text-xs flex-1"
          />
          <span className="text-xs text-muted-foreground">{t('andSeparator')}</span>
          <Input
            type="number"
            value={condition.values?.[1] ?? ''}
            onChange={(e) => onChange({ ...condition, values: [condition.values?.[0] ?? '', e.target.value] })}
            placeholder={t('maxPlaceholder')}
            className="h-8 text-xs flex-1"
          />
        </div>
      )}

      {isDateOp && (
        <Input
          type="date"
          value={condition.value ?? ''}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          className="h-8 text-xs flex-1"
        />
      )}
    </ConditionRowWrapper>
  );
}

/** Simple tag-input for multi-value operators (in / not_in) */
function MultiValueInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [inputValue, setInputValue] = useState('');

  const addValue = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInputValue('');
  }, [values, onChange]);

  const removeValue = useCallback((idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  }, [values, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addValue(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && values.length > 0) {
      removeValue(values.length - 1);
    }
  }, [inputValue, values, addValue, removeValue]);

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) {
      addValue(inputValue);
    }
  }, [inputValue, addValue]);

  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background px-2 py-1.5 min-h-[32px] items-center">
      {values.map((v, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-xs"
        >
          {v}
          <button
            type="button"
            onClick={() => removeValue(i)}
            className="text-muted-foreground/50 hover:text-destructive ml-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={values.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[60px] bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
