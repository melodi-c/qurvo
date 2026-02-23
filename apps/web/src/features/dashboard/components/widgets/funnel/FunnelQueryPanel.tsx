import { useMemo } from 'react';
import { Timer, TrendingDown, Shuffle, Ban, BarChart3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { BreakdownSection } from '@/components/ui/breakdown-section';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FunnelStepBuilder } from './FunnelStepBuilder';
import { FunnelExclusionBuilder } from './FunnelExclusionBuilder';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './FunnelQueryPanel.translations';
import type { FunnelWidgetConfig } from '@/api/generated/Api';

interface FunnelQueryPanelProps {
  config: FunnelWidgetConfig;
  onChange: (config: FunnelWidgetConfig) => void;
}

const WINDOW_UNITS = ['second', 'minute', 'hour', 'day', 'week', 'month'] as const;

export function FunnelQueryPanel({ config, onChange }: FunnelQueryPanelProps) {
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames();
  const { t } = useLocalTranslation(translations);

  const orderOptions = useMemo(() => [
    { label: t('ordered'), value: 'ordered' as const },
    { label: t('strict'), value: 'strict' as const },
    { label: t('unordered'), value: 'unordered' as const },
  ], [t]);

  const rateDisplayOptions = useMemo(() => [
    { label: t('total'), value: 'total' as const },
    { label: t('relative'), value: 'relative' as const },
  ], [t]);

  const windowUnitLabels = useMemo(() => ({
    second: t('second'),
    minute: t('minute'),
    hour: t('hour'),
    day: t('day'),
    week: t('week'),
    month: t('month'),
  }), [t]);

  const cfg = config as any; // new fields not yet in generated types

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
          <SectionHeader icon={TrendingDown} label={t('steps')} />
          <FunnelStepBuilder
            steps={config.steps}
            onChange={(steps) => onChange({ ...config, steps })}
          />
        </section>

        <Separator />

        {/* Order type */}
        <section className="space-y-3">
          <SectionHeader icon={Shuffle} label={t('orderType')} />
          <PillToggleGroup
            options={orderOptions}
            value={cfg.funnel_order_type ?? 'ordered'}
            onChange={(funnel_order_type) => onChange({ ...config, funnel_order_type } as any)}
          />
        </section>

        <Separator />

        {/* Conversion window */}
        <section className="space-y-3">
          <SectionHeader icon={Timer} label={t('conversionWindow')} />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={9999}
              value={cfg.conversion_window_value ?? config.conversion_window_days}
              onChange={(e) => {
                const val = Number(e.target.value);
                const unit = cfg.conversion_window_unit ?? 'day';
                onChange({
                  ...config,
                  conversion_window_value: val,
                  conversion_window_unit: unit,
                  conversion_window_days: unit === 'day' ? val : config.conversion_window_days,
                } as any);
              }}
              className="h-8 w-20 text-sm"
            />
            <Select
              value={cfg.conversion_window_unit ?? 'day'}
              onValueChange={(unit) => {
                const val = cfg.conversion_window_value ?? config.conversion_window_days;
                onChange({
                  ...config,
                  conversion_window_unit: unit,
                  conversion_window_value: val,
                  conversion_window_days: unit === 'day' ? val : config.conversion_window_days,
                } as any);
              }}
            >
              <SelectTrigger size="sm" className="h-8 w-[80px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>{windowUnitLabels[u]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <Separator />

        {/* Display: conversion rate mode */}
        <section className="space-y-3">
          <SectionHeader icon={BarChart3} label={t('conversionRate')} />
          <PillToggleGroup
            options={rateDisplayOptions}
            value={cfg.conversion_rate_display ?? 'total'}
            onChange={(conversion_rate_display) => onChange({ ...config, conversion_rate_display } as any)}
          />
        </section>

        <Separator />

        {/* Exclusion steps */}
        <section className="space-y-3">
          <SectionHeader icon={Ban} label={t('exclusions')} />
          <FunnelExclusionBuilder
            exclusions={cfg.exclusions ?? []}
            onChange={(exclusions) => onChange({ ...config, exclusions } as any)}
            stepCount={config.steps.length}
          />
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
          propertyDescriptions={propDescriptions}
          breakdownType={cfg.breakdown_type ?? 'property'}
          onBreakdownTypeChange={(type) => onChange({
            ...config,
            breakdown_type: type,
            ...(type === 'cohort' ? { breakdown_property: undefined } : { breakdown_cohort_ids: undefined }),
          } as any)}
          breakdownCohortIds={cfg.breakdown_cohort_ids ?? []}
          onBreakdownCohortIdsChange={(ids) => onChange({
            ...config,
            breakdown_cohort_ids: ids.length ? ids : undefined,
          } as any)}
        />
      </div>
    </aside>
  );
}
