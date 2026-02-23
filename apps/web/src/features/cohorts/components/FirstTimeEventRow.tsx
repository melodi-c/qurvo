import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
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
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">{t('firstTimeEvent')}</span>
        <button type="button" onClick={onRemove} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      </div>

      <EventNameCombobox
        value={condition.event_name}
        onChange={(event_name) => onChange({ ...condition, event_name })}
        placeholder={t('selectEvent')}
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{t('inLast')}</span>
        <Input
          type="number" min={1} max={365}
          value={condition.time_window_days}
          onChange={(e) => onChange({ ...condition, time_window_days: Number(e.target.value) })}
          className="h-8 text-xs w-16"
        />
        <span className="text-xs text-muted-foreground">{t('days')}</span>
      </div>
    </div>
  );
}
