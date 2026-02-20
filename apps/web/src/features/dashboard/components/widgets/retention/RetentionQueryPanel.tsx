import { CalendarCheck, BarChart3 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { EventNameCombobox } from '../funnel/EventNameCombobox';
import { RETENTION_TYPE_OPTIONS, RETENTION_GRANULARITY_OPTIONS } from './retention-shared';
import type { RetentionWidgetConfig } from '@/api/generated/Api';

interface RetentionQueryPanelProps {
  config: RetentionWidgetConfig;
  onChange: (config: RetentionWidgetConfig) => void;
}

export function RetentionQueryPanel({ config, onChange }: RetentionQueryPanelProps) {
  return (
    <aside className="w-[360px] flex-shrink-0 border-r border-border overflow-y-auto">
      <div className="p-5 space-y-6">

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange({ ...config, date_from, date_to })}
        />

        <Separator />

        {/* Target Event */}
        <section className="space-y-3">
          <SectionHeader icon={CalendarCheck} label="Event" />
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

        {/* Retention Type + Granularity + Periods */}
        <section className="space-y-3">
          <SectionHeader icon={BarChart3} label="Display" />

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Retention type</span>
            <PillToggleGroup
              options={RETENTION_TYPE_OPTIONS}
              value={config.retention_type}
              onChange={(v) => onChange({ ...config, retention_type: v as RetentionWidgetConfig['retention_type'] })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Granularity</span>
              <Select
                value={config.granularity}
                onValueChange={(v) => onChange({ ...config, granularity: v as RetentionWidgetConfig['granularity'] })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_GRANULARITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-sm">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Periods</span>
              <Input
                type="number"
                min={1}
                max={30}
                value={config.periods}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 1 && v <= 30) onChange({ ...config, periods: v });
                }}
                className="h-8 text-sm"
              />
            </div>
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
