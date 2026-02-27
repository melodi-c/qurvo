import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { PropertyNameCombobox } from '@/components/PropertyNameCombobox';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { ConditionRowWrapper } from './ConditionRowWrapper';
import { TimeWindowInput } from './TimeWindowInput';
import translations from './EventConditionRow.translations';
import type { EventCondition, CohortAggregationType } from '../types';

interface EventConditionRowProps {
  condition: EventCondition;
  onChange: (condition: EventCondition) => void;
  onRemove: () => void;
}

export function EventConditionRow({ condition, onChange, onRemove }: EventConditionRowProps) {
  const { t } = useLocalTranslation(translations);
  const { data: propertyNames, descriptions: propDescriptions } = useEventPropertyNames(condition.event_name || undefined);

  const isCount = !condition.aggregation_type || condition.aggregation_type === 'count';

  const countOperators = useMemo(() => [
    { value: 'gte', label: t('atLeast') },
    { value: 'lte', label: t('atMost') },
    { value: 'eq', label: t('exactly') },
  ] as const, [t]);

  const aggregationTypes = useMemo(() => [
    { value: 'count', label: t('aggCount') },
    { value: 'sum', label: t('aggSum') },
    { value: 'avg', label: t('aggAvg') },
    { value: 'min', label: t('aggMin') },
    { value: 'max', label: t('aggMax') },
    { value: 'median', label: t('aggMedian') },
    { value: 'p75', label: t('aggP75') },
    { value: 'p90', label: t('aggP90') },
    { value: 'p95', label: t('aggP95') },
    { value: 'p99', label: t('aggP99') },
  ] as const, [t]);

  return (
    <ConditionRowWrapper label={t('performedEvent')} labelColor="text-emerald-400" onRemove={onRemove}>
      <EventNameCombobox
        value={condition.event_name}
        onChange={(event_name) => onChange({ ...condition, event_name })}
        placeholder={t('selectEvent')}
      />

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Select
            value={condition.aggregation_type ?? 'count'}
            onValueChange={(v) => {
              const aggType = v as CohortAggregationType;
              onChange({
                ...condition,
                aggregation_type: aggType === 'count' ? undefined : aggType,
                aggregation_property: aggType === 'count' ? undefined : condition.aggregation_property,
              });
            }}
          >
            <SelectTrigger size="sm" className="h-8 text-xs min-w-0 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aggregationTypes.map((at) => (
                <SelectItem key={at.value} value={at.value} className="text-xs">
                  {at.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <InfoTooltip content={t('aggregationTooltip')} />

          {!isCount && (
            <PropertyNameCombobox
              value={condition.aggregation_property ?? ''}
              onChange={(v) => onChange({ ...condition, aggregation_property: v })}
              propertyNames={propertyNames ?? []}
              descriptions={propDescriptions}
              className="h-8 text-xs flex-1"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={condition.count_operator}
            onValueChange={(v) => onChange({ ...condition, count_operator: v as EventCondition['count_operator'] })}
          >
            <SelectTrigger size="sm" className="h-8 text-xs min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {countOperators.map((op) => (
                <SelectItem key={op.value} value={op.value} className="text-xs">
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            min={0}
            step={isCount ? 1 : 'any'}
            value={condition.count}
            onChange={(e) => onChange({ ...condition, count: Number(e.target.value) })}
            className="h-8 text-xs w-20"
          />

          {isCount && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t('times')}</span>
          )}
        </div>

        <TimeWindowInput
          value={condition.time_window_days}
          onChange={(time_window_days) => onChange({ ...condition, time_window_days })}
        />
      </div>
    </ConditionRowWrapper>
  );
}
