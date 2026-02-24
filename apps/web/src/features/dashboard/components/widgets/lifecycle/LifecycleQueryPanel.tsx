import { useMemo } from 'react';
import { HeartPulse, BarChart3 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeader } from '@/components/ui/section-header';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './LifecycleQueryPanel.translations';
import type { LifecycleWidgetConfig } from '@/api/generated/Api';

interface LifecycleQueryPanelProps {
  config: LifecycleWidgetConfig;
  onChange: (config: LifecycleWidgetConfig) => void;
}

export function LifecycleQueryPanel({ config, onChange }: LifecycleQueryPanelProps) {
  const { t } = useLocalTranslation(translations);

  const granularityOptions = useMemo(() => [
    { value: 'day', label: t('day') },
    { value: 'week', label: t('week') },
    { value: 'month', label: t('month') },
  ], [t]);

  return (
    <QueryPanelShell>

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange({ ...config, date_from, date_to })}
        />

        <Separator />

        <section className="space-y-3">
          <SectionHeader icon={HeartPulse} label={t('event')} />
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
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{t('granularity')}</span>
            <Select
              value={config.granularity}
              onValueChange={(v) => onChange({ ...config, granularity: v as LifecycleWidgetConfig['granularity'] })}
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
        </section>

        <Separator />

        <CohortFilterSection
          value={config.cohort_ids ?? []}
          onChange={(cohort_ids) => onChange({ ...config, cohort_ids: cohort_ids.length ? cohort_ids : undefined })}
        />
    </QueryPanelShell>
  );
}
