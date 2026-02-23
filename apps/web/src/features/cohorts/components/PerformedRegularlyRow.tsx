import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './PerformedRegularlyRow.translations';
import type { PerformedRegularlyCondition } from '../types';

interface PerformedRegularlyRowProps {
  condition: PerformedRegularlyCondition;
  onChange: (condition: PerformedRegularlyCondition) => void;
  onRemove: () => void;
}

export function PerformedRegularlyRow({ condition, onChange, onRemove }: PerformedRegularlyRowProps) {
  const { t } = useLocalTranslation(translations);

  const periodTypes = useMemo(() => [
    { value: 'day', label: t('day') },
    { value: 'week', label: t('week') },
    { value: 'month', label: t('month') },
  ] as const, [t]);

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">{t('performedRegularly')}</span>
        <button type="button" onClick={onRemove} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      </div>

      <EventNameCombobox
        value={condition.event_name}
        onChange={(event_name) => onChange({ ...condition, event_name })}
        placeholder={t('selectEvent')}
      />

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('atLeastIn')}</span>
          <Input
            type="number" min={1}
            value={condition.min_periods}
            onChange={(e) => onChange({ ...condition, min_periods: Number(e.target.value) })}
            className="h-8 text-xs w-16"
          />
          <span className="text-xs text-muted-foreground">{t('outOf')}</span>
          <Input
            type="number" min={1}
            value={condition.total_periods}
            onChange={(e) => onChange({ ...condition, total_periods: Number(e.target.value) })}
            className="h-8 text-xs w-16"
          />
          <Select
            value={condition.period_type}
            onValueChange={(v) => onChange({ ...condition, period_type: v as 'day' | 'week' | 'month' })}
          >
            <SelectTrigger size="sm" className="h-8 text-xs w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodTypes.map((pt) => (
                <SelectItem key={pt.value} value={pt.value} className="text-xs">{pt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('inLast')}</span>
          <Input
            type="number" min={1} max={365}
            value={condition.time_window_days}
            onChange={(e) => onChange({ ...condition, time_window_days: Number(e.target.value) })}
            className="h-8 text-xs w-20"
          />
          <span className="text-xs text-muted-foreground">{t('days')}</span>
        </div>
      </div>
    </div>
  );
}
