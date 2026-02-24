import { Input } from '@/components/ui/input';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { ConditionRowWrapper } from './ConditionRowWrapper';
import translations from './StoppedPerformingRow.translations';
import type { StoppedPerformingCondition } from '../types';

interface StoppedPerformingRowProps {
  condition: StoppedPerformingCondition;
  onChange: (condition: StoppedPerformingCondition) => void;
  onRemove: () => void;
}

export function StoppedPerformingRow({ condition, onChange, onRemove }: StoppedPerformingRowProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <ConditionRowWrapper label={t('stoppedPerforming')} labelColor="text-orange-400" onRemove={onRemove}>
      <EventNameCombobox
        value={condition.event_name}
        onChange={(event_name) => onChange({ ...condition, event_name })}
        placeholder={t('selectEvent')}
      />

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('didInLast')}</span>
          <Input
            type="number" min={1} max={365}
            value={condition.historical_window_days}
            onChange={(e) => onChange({ ...condition, historical_window_days: Number(e.target.value) })}
            className="h-8 text-xs w-20"
          />
          <span className="text-xs text-muted-foreground">{t('days')}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('butNotInLast')}</span>
          <Input
            type="number" min={1} max={365}
            value={condition.recent_window_days}
            onChange={(e) => onChange({ ...condition, recent_window_days: Number(e.target.value) })}
            className="h-8 text-xs w-20"
          />
          <span className="text-xs text-muted-foreground">{t('days')}</span>
        </div>
      </div>
    </ConditionRowWrapper>
  );
}
