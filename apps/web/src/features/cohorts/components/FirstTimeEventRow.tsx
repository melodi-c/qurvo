import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { ConditionRowWrapper } from './ConditionRowWrapper';
import { TimeWindowInput } from './TimeWindowInput';
import translations from './FirstTimeEventRow.translations';
import type { FirstTimeEventCondition } from '../types';

interface FirstTimeEventRowProps {
  condition: FirstTimeEventCondition;
  onChange: (condition: FirstTimeEventCondition) => void;
  onRemove: () => void;
}

export function FirstTimeEventRow({ condition, onChange, onRemove }: FirstTimeEventRowProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <ConditionRowWrapper label={t('firstTimeEvent')} labelColor="text-cyan-400" onRemove={onRemove}>
      <EventNameCombobox
        value={condition.event_name}
        onChange={(event_name) => onChange({ ...condition, event_name })}
        placeholder={t('selectEvent')}
      />
      <TimeWindowInput
        value={condition.time_window_days}
        onChange={(time_window_days) => onChange({ ...condition, time_window_days })}
      />
    </ConditionRowWrapper>
  );
}
