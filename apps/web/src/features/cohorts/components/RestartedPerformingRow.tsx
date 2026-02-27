import { Input } from '@/components/ui/input';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { ConditionRowWrapper } from './ConditionRowWrapper';
import translations from './RestartedPerformingRow.translations';
import type { RestartedPerformingCondition } from '../types';

interface RestartedPerformingRowProps {
  condition: RestartedPerformingCondition;
  onChange: (condition: RestartedPerformingCondition) => void;
  onRemove: () => void;
}

export function RestartedPerformingRow({ condition, onChange, onRemove }: RestartedPerformingRowProps) {
  const { t } = useLocalTranslation(translations);

  const windowError =
    condition.historical_window_days <= condition.recent_window_days + condition.gap_window_days
      ? t('windowError')
      : undefined;

  return (
    <ConditionRowWrapper label={t('restartedPerforming')} labelColor="text-teal-400" tooltip={t('tooltip')} onRemove={onRemove}>
      <EventNameCombobox
        value={condition.event_name}
        onChange={(event_name) => onChange({ ...condition, event_name })}
        placeholder={t('selectEvent')}
      />

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('historicalWindow')}</span>
          <Input
            type="number" min={1} max={365}
            value={condition.historical_window_days}
            onChange={(e) => onChange({ ...condition, historical_window_days: Number(e.target.value) })}
            className={`h-8 text-xs w-20${windowError ? ' border-destructive' : ''}`}
          />
          <span className="text-xs text-muted-foreground">{t('days')}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('gapWindow')}</span>
          <Input
            type="number" min={1} max={365}
            value={condition.gap_window_days}
            onChange={(e) => onChange({ ...condition, gap_window_days: Number(e.target.value) })}
            className="h-8 text-xs w-20"
          />
          <span className="text-xs text-muted-foreground">{t('days')}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('recentWindow')}</span>
          <Input
            type="number" min={1} max={365}
            value={condition.recent_window_days}
            onChange={(e) => onChange({ ...condition, recent_window_days: Number(e.target.value) })}
            className="h-8 text-xs w-20"
          />
          <span className="text-xs text-muted-foreground">{t('days')}</span>
        </div>

        {windowError && (
          <p className="text-xs text-destructive">{windowError}</p>
        )}
      </div>
    </ConditionRowWrapper>
  );
}
