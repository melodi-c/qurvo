import {
  TrendingUp,
  BarChart3,
  ArrowLeftRight,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { BreakdownSection } from '@/components/ui/breakdown-section';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { TrendSeriesBuilder } from './TrendSeriesBuilder';
import { METRIC_OPTIONS, GRANULARITY_OPTIONS, CHART_TYPE_OPTIONS } from './trend-shared';
import type { TrendWidgetConfig } from '@/api/generated/Api';

interface TrendQueryPanelProps {
  config: TrendWidgetConfig;
  onChange: (config: TrendWidgetConfig) => void;
}

export function TrendQueryPanel({ config, onChange }: TrendQueryPanelProps) {
  return (
    <aside className="w-[360px] flex-shrink-0 border-r border-border overflow-y-auto">
      <div className="p-5 space-y-6">

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange({ ...config, date_from, date_to })}
        />

        <Separator />

        {/* Series */}
        <section className="space-y-3">
          <SectionHeader icon={TrendingUp} label="Series" />
          <TrendSeriesBuilder
            series={config.series}
            onChange={(series) => onChange({ ...config, series })}
          />
        </section>

        <Separator />

        {/* Metric + Granularity */}
        <section className="space-y-3">
          <SectionHeader icon={BarChart3} label="Display" />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Metric</span>
              <Select
                value={config.metric}
                onValueChange={(v) => onChange({ ...config, metric: v as TrendWidgetConfig['metric'] })}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-sm">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Granularity</span>
              <Select
                value={config.granularity}
                onValueChange={(v) => onChange({ ...config, granularity: v as TrendWidgetConfig['granularity'] })}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRANULARITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-sm">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Chart type */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Chart type</span>
            <PillToggleGroup
              options={CHART_TYPE_OPTIONS}
              value={config.chart_type}
              onChange={(v) => onChange({ ...config, chart_type: v as TrendWidgetConfig['chart_type'] })}
            />
          </div>
        </section>

        <Separator />

        {/* Compare */}
        <section className="space-y-3">
          <SectionHeader icon={ArrowLeftRight} label="Compare" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.compare}
              onChange={(e) => onChange({ ...config, compare: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">Compare to previous period</span>
          </label>
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
        />
      </div>
    </aside>
  );
}
