import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './EventConditionRow.translations';
import type { EventCondition } from '../types';

interface EventConditionRowProps {
  condition: EventCondition;
  onChange: (condition: EventCondition) => void;
  onRemove: () => void;
}

export function EventConditionRow({ condition, onChange, onRemove }: EventConditionRowProps) {
  const { t } = useLocalTranslation(translations);

  const countOperators = useMemo(() => [
    { value: 'gte', label: t('atLeast') },
    { value: 'lte', label: t('atMost') },
    { value: 'eq', label: t('exactly') },
  ] as const, [t]);

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">{t('performedEvent')}</span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <EventNameCombobox
        value={condition.event_name}
        onChange={(event_name) => onChange({ ...condition, event_name })}
        placeholder={t('selectEvent')}
      />

      <div className="flex items-center gap-2">
        <Select
          value={condition.count_operator}
          onValueChange={(v) => onChange({ ...condition, count_operator: v as EventCondition['count_operator'] })}
        >
          <SelectTrigger size="sm" className="h-8 text-xs w-[100px]">
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
          value={condition.count}
          onChange={(e) => onChange({ ...condition, count: Number(e.target.value) })}
          className="h-8 text-xs w-16"
        />

        <span className="text-xs text-muted-foreground whitespace-nowrap">{t('timesInLast')}</span>

        <Input
          type="number"
          min={1}
          max={365}
          value={condition.time_window_days}
          onChange={(e) => onChange({ ...condition, time_window_days: Number(e.target.value) })}
          className="h-8 text-xs w-16"
        />

        <span className="text-xs text-muted-foreground">{t('days')}</span>
      </div>
    </div>
  );
}
