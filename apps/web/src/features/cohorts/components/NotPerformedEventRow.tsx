import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { ConditionRowWrapper } from './ConditionRowWrapper';
import { TimeWindowInput } from './TimeWindowInput';
import translations from './NotPerformedEventRow.translations';
import type { NotPerformedEventCondition } from '../types';

interface NotPerformedEventRowProps {
  condition: NotPerformedEventCondition;
  onChange: (condition: NotPerformedEventCondition) => void;
  onRemove: () => void;
}

export function NotPerformedEventRow({ condition, onChange, onRemove }: NotPerformedEventRowProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <ConditionRowWrapper label={t('notPerformedEvent')} labelColor="text-red-400" onRemove={onRemove}>
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
