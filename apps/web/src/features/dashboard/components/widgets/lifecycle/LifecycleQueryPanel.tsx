import { HeartPulse, BarChart3 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { EventNameCombobox } from '../funnel/EventNameCombobox';
import { LIFECYCLE_GRANULARITY_OPTIONS } from './lifecycle-shared';
import type { LifecycleWidgetConfig } from '@/api/generated/Api';

interface LifecycleQueryPanelProps {
  config: LifecycleWidgetConfig;
  onChange: (config: LifecycleWidgetConfig) => void;
}

export function LifecycleQueryPanel({ config, onChange }: LifecycleQueryPanelProps) {
  return (
    <aside className="w-full lg:w-[360px] shrink-0 border-b border-border lg:border-b-0 lg:border-r overflow-y-auto max-h-[50vh] lg:max-h-none">
      <div className="p-5 space-y-6">

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange({ ...config, date_from, date_to })}
        />

        <Separator />

        <section className="space-y-3">
          <SectionHeader icon={HeartPulse} label="Event" />
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Target event</span>
            <EventNameCombobox
              value={config.target_event}
              onChange={(target_event) => onChange({ ...config, target_event })}
              placeholder="Select event..."
              className="h-9 rounded-md border-border px-3"
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <SectionHeader icon={BarChart3} label="Display" />
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Granularity</span>
            <Select
              value={config.granularity}
              onValueChange={(v) => onChange({ ...config, granularity: v as LifecycleWidgetConfig['granularity'] })}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIFECYCLE_GRANULARITY_OPTIONS.map((o) => (
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
      </div>
    </aside>
  );
}
