import {
  CalendarDays,
  TrendingUp,
  BarChart3,
  SlidersHorizontal,
  ArrowLeftRight,
  UsersRound,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendSeriesBuilder } from './TrendSeriesBuilder';
import { SectionHeader, DATE_PRESETS, daysAgo, today } from '../funnel/funnel-shared';
import { METRIC_OPTIONS, GRANULARITY_OPTIONS, CHART_TYPE_OPTIONS } from './trend-shared';
import { CohortSelector } from '@/features/cohorts/components/CohortSelector';
import type { TrendWidgetConfig } from '@/api/generated/Api';

interface TrendQueryPanelProps {
  config: TrendWidgetConfig;
  onChange: (config: TrendWidgetConfig) => void;
}

export function TrendQueryPanel({ config, onChange }: TrendQueryPanelProps) {
  return (
    <aside className="w-[360px] flex-shrink-0 border-r border-border overflow-y-auto">
      <div className="p-5 space-y-6">

        {/* Date range */}
        <section className="space-y-3">
          <SectionHeader icon={CalendarDays} label="Date range" />
          <div className="flex gap-1 flex-wrap">
            {DATE_PRESETS.map(({ label, days }) => {
              const from = daysAgo(days);
              const to = today();
              const active =
                config.date_from.slice(0, 10) === from &&
                config.date_to.slice(0, 10) === to;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onChange({ ...config, date_from: from, date_to: to })}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">From</span>
              <Input
                type="date"
                value={config.date_from.slice(0, 10)}
                onChange={(e) => onChange({ ...config, date_from: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">To</span>
              <Input
                type="date"
                value={config.date_to.slice(0, 10)}
                onChange={(e) => onChange({ ...config, date_to: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </section>

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
                <SelectTrigger className="h-8 text-sm">
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
                <SelectTrigger className="h-8 text-sm">
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
            <div className="flex gap-1">
              {CHART_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange({ ...config, chart_type: o.value as TrendWidgetConfig['chart_type'] })}
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                    config.chart_type === o.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
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

        {/* Cohort filter */}
        <section className="space-y-3">
          <SectionHeader icon={UsersRound} label="Cohort filter" />
          <CohortSelector
            value={config.cohort_ids ?? []}
            onChange={(cohort_ids) => onChange({ ...config, cohort_ids: cohort_ids.length ? cohort_ids : undefined })}
          />
          <p className="text-xs text-muted-foreground">
            Filter results to users in selected cohorts
          </p>
        </section>

        <Separator />

        {/* Breakdown */}
        <section className="space-y-3">
          <SectionHeader icon={SlidersHorizontal} label="Breakdown" />
          <Input
            value={config.breakdown_property || ''}
            onChange={(e) =>
              onChange({
                ...config,
                breakdown_property: e.target.value || undefined,
              })
            }
            placeholder="e.g. country, plan, properties.utm_source"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Split results by a user or event property
          </p>
        </section>
      </div>
    </aside>
  );
}
