import { useMemo } from 'react';
import type { ElementType, ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TargetEventQueryPanel.translations';

export interface BaseTargetEventConfig {
  date_from: string;
  date_to: string;
  target_event: string;
  granularity: 'day' | 'week' | 'month';
  cohort_ids?: string[];
}

interface TargetEventQueryPanelProps<T extends BaseTargetEventConfig> {
  config: T;
  onChange: (config: T) => void;
  eventIcon: ElementType;
  extraDisplayContent?: ReactNode;
  granularityAdjacentContent?: ReactNode;
}

export function TargetEventQueryPanel<T extends BaseTargetEventConfig>({
  config,
  onChange,
  eventIcon,
  extraDisplayContent,
  granularityAdjacentContent,
}: TargetEventQueryPanelProps<T>) {
  const { t } = useLocalTranslation(translations);

  const granularityOptions = useMemo(() => [
    { value: 'day' as const, label: t('day') },
    { value: 'week' as const, label: t('week') },
    { value: 'month' as const, label: t('month') },
  ], [t]);

  const granularitySelect = (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{t('granularity')}</span>
      <Select
        value={config.granularity}
        onValueChange={(v) => onChange({ ...config, granularity: v as T['granularity'] })}
      >
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {granularityOptions.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-sm">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <QueryPanelShell>

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange({ ...config, date_from, date_to })}
        />

        <Separator />

        <section className="space-y-3">
          <SectionHeader icon={eventIcon} label={t('event')} />
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{t('targetEvent')}</span>
            <EventNameCombobox
              value={config.target_event}
              onChange={(target_event) => onChange({ ...config, target_event })}
              placeholder={t('selectEvent')}
              className="h-9 rounded-md border-border px-3"
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <SectionHeader icon={BarChart3} label={t('display')} />

          {extraDisplayContent}

          {granularityAdjacentContent ? (
            <div className="grid grid-cols-2 gap-2">
              {granularitySelect}
              {granularityAdjacentContent}
            </div>
          ) : (
            granularitySelect
          )}
        </section>

        <Separator />

        <CohortFilterSection
          value={config.cohort_ids ?? []}
          onChange={(cohort_ids) => onChange({ ...config, cohort_ids: cohort_ids.length ? cohort_ids : undefined })}
        />
    </QueryPanelShell>
  );
}
