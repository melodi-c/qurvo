import { CalendarDays, Timer, SlidersHorizontal, TrendingDown, UsersRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { FunnelStepBuilder } from './FunnelStepBuilder';
import { SectionHeader } from '@/components/ui/section-header';
import { DATE_PRESETS, daysAgo, today } from './funnel-shared';
import { CohortSelector } from '@/features/cohorts/components/CohortSelector';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

interface FunnelQueryPanelProps {
  config: FunnelWidgetConfig;
  onChange: (config: FunnelWidgetConfig) => void;
}

export function FunnelQueryPanel({ config, onChange }: FunnelQueryPanelProps) {
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

        {/* Steps */}
        <section className="space-y-3">
          <SectionHeader icon={TrendingDown} label="Steps" />
          <FunnelStepBuilder
            steps={config.steps}
            onChange={(steps) => onChange({ ...config, steps })}
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
