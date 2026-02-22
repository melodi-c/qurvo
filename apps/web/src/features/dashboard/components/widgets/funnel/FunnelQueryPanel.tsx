import { Timer, TrendingDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { BreakdownSection } from '@/components/ui/breakdown-section';
import { FunnelStepBuilder } from './FunnelStepBuilder';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

interface FunnelQueryPanelProps {
  config: FunnelWidgetConfig;
  onChange: (config: FunnelWidgetConfig) => void;
}

export function FunnelQueryPanel({ config, onChange }: FunnelQueryPanelProps) {
  const { data: propertyNames = [] } = useEventPropertyNames();

  return (
    <aside className="w-full lg:w-[360px] shrink-0 border-b border-border lg:border-b-0 lg:border-r overflow-y-auto max-h-[50vh] lg:max-h-none">
      <div className="p-5 space-y-6">

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange({ ...config, date_from, date_to })}
        />

        <Separator />

        {/* Steps */}
        <section className="space-y-3">
          <SectionHeader icon={TrendingDown} label="Steps" />
          <FunnelStepBuilder
            steps={config.steps}
            onChange={(steps) => onChange({ ...config, steps })}
            propertyNames={propertyNames}
          />
        </section>

        <Separator />

        {/* Conversion window */}
        <section className="space-y-3">
          <SectionHeader icon={Timer} label="Conversion window" />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={90}
              value={config.conversion_window_days}
              onChange={(e) =>
                onChange({ ...config, conversion_window_days: Number(e.target.value) })
              }
              className="h-8 w-20 text-sm"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </section>

        <Separator />

        <CohortFilterSection
          value={config.cohort_ids ?? []}
          onChange={(cohort_ids) => onChange({ ...config, cohort_ids: cohort_ids.length ? cohort_ids : undefined })}
        />

        <Separator />

        <BreakdownSection
          value={config.breakdown_property || ''}
          onChange={(v) => onChange({ ...config, breakdown_property: v || undefined })}
          propertyNames={propertyNames}
        />
      </div>
    </aside>
  );
}
