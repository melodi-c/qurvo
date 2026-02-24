import { EventNameCombobox } from '@/components/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { ConditionRowWrapper } from './ConditionRowWrapper';
import { TimeWindowInput } from './TimeWindowInput';
import translations from './SimpleEventConditionRow.translations';
import type { FirstTimeEventCondition, NotPerformedEventCondition } from '../types';

type SimpleCondition = FirstTimeEventCondition | NotPerformedEventCondition;

interface SimpleEventConditionRowProps {
  condition: SimpleCondition;
  onChange: (condition: SimpleCondition) => void;
  onRemove: () => void;
  variant: 'first_time' | 'not_performed';
}

export function SimpleEventConditionRow({ condition, onChange, onRemove, variant }: SimpleEventConditionRowProps) {
  const { t } = useLocalTranslation(translations);

  const label = variant === 'first_time' ? t('firstTimeEvent') : t('notPerformedEvent');
  const labelColor = variant === 'first_time' ? 'text-cyan-400' : 'text-red-400';

  return (
    <ConditionRowWrapper label={label} labelColor={labelColor} onRemove={onRemove}>
      <EventNameCombobox
        value={condition.event_name}
        onChange={(event_name) => onChange({ ...condition, event_name } as SimpleCondition)}
        placeholder={t('selectEvent')}
      />
      <TimeWindowInput
        value={condition.time_window_days}
        onChange={(time_window_days) => onChange({ ...condition, time_window_days } as SimpleCondition)}
      />
    </ConditionRowWrapper>
  );
}
