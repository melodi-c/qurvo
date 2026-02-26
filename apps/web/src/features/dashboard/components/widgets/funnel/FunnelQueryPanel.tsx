import { useMemo, useState } from 'react';
import { Timer, TrendingDown, Shuffle, Ban, BarChart3, FlaskConical, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { BreakdownSection } from '@/components/ui/breakdown-section';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const orderOptions = useMemo(() => [
    { label: t('ordered'), desc: t('orderedDesc'), value: 'ordered' as const },
    { label: t('strict'), desc: t('strictDesc'), value: 'strict' as const },
    { label: t('unordered'), desc: t('unorderedDesc'), value: 'unordered' as const },
  ], [t]);

  const rateDisplayOptions = useMemo(() => [
    { label: t('total'), value: 'total' as const },
    { label: t('relative'), value: 'relative' as const },
  ], [t]);

  const samplingOptions = useMemo(() => [
    { label: t('noSampling'), value: '1' },
    { label: '10%', value: '0.1' },
    { label: '25%', value: '0.25' },
    { label: '50%', value: '0.5' },
  ], [t]);

  const windowUnitLabels = useMemo(() => ({
    second: t('second'),
    minute: t('minute'),
    hour: t('hour'),
    day: t('day'),
    week: t('week'),
    month: t('month'),
  }), [t]);

  const activeAdvancedCount = useMemo(() => [
    config.funnel_order_type !== undefined && config.funnel_order_type !== 'ordered',
    (config.exclusions?.length ?? 0) > 0,
    config.sampling_factor !== undefined && config.sampling_factor !== 1,
    (config.breakdown_cohort_ids?.length ?? 0) > 0,
  ].filter(Boolean).length, [config.funnel_order_type, config.exclusions, config.sampling_factor, config.breakdown_cohort_ids]);

  function handleResetAdvanced() {
    onChange({
      ...config,
      funnel_order_type: 'ordered',
      exclusions: undefined,
      sampling_factor: undefined,
      breakdown_cohort_ids: undefined,
      ...(config.breakdown_type === 'cohort' ? { breakdown_type: 'property' } : {}),
    });
  }

  return (
    <QueryPanelShell>

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

        {/* Conversion window */}
        <section className="space-y-3">
          <div className="flex items-center gap-1">
            <SectionHeader icon={Timer} label={t('conversionWindow')} />
            <InfoTooltip content={t('conversionWindowTooltip')} />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={9999}
              value={config.conversion_window_value ?? config.conversion_window_days}
              onChange={(e) => {
                const val = Number(e.target.value);
                const unit = config.conversion_window_unit ?? 'day';
                onChange({
                  ...config,
                  conversion_window_value: val,
                  conversion_window_unit: unit,
                  conversion_window_days: unit === 'day' ? val : config.conversion_window_days,
                });
              }}
              className="h-8 w-20 text-sm"
            />
            <Select
              value={config.conversion_window_unit ?? 'day'}
              onValueChange={(unit) => {
                const val = config.conversion_window_value ?? config.conversion_window_days;
                onChange({
                  ...config,
                  conversion_window_unit: unit as typeof WINDOW_UNITS[number],
                  conversion_window_value: val,
                  conversion_window_days: unit === 'day' ? val : config.conversion_window_days,
                });
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
          <div className="flex items-center gap-1">
            <SectionHeader icon={BarChart3} label={t('conversionRate')} />
            <InfoTooltip content={t('conversionRateTooltip')} />
          </div>
          <PillToggleGroup
            options={rateDisplayOptions}
            value={config.conversion_rate_display ?? 'total'}
            onChange={(conversion_rate_display) => onChange({ ...config, conversion_rate_display })}
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
          breakdownType={config.breakdown_type ?? 'property'}
          onBreakdownTypeChange={(type) => onChange({
            ...config,
            breakdown_type: type,
            ...(type === 'cohort' ? { breakdown_property: undefined } : { breakdown_cohort_ids: undefined }),
          })}
          breakdownCohortIds={config.breakdown_cohort_ids ?? []}
          onBreakdownCohortIdsChange={(ids) => onChange({
            ...config,
            breakdown_cohort_ids: ids.length ? ids : undefined,
          })}
        />

        <Separator />

        {/* Advanced options */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              {advancedOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {t('advancedOptions')}
              {activeAdvancedCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                  {activeAdvancedCount}
                </Badge>
              )}
            </CollapsibleTrigger>
            {activeAdvancedCount > 0 && (
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleResetAdvanced}
              >
                {t('resetAdvanced')}
              </Button>
            )}
          </div>

          <CollapsibleContent className="space-y-4 pt-3">
            {/* Order type */}
            <section className="space-y-3">
              <div className="flex items-center gap-1">
                <SectionHeader icon={Shuffle} label={t('orderType')} />
                <InfoTooltip content={t('orderTypeTooltip')} />
              </div>
              <Select
                value={config.funnel_order_type ?? 'ordered'}
                onValueChange={(v) => onChange({ ...config, funnel_order_type: v as FunnelWidgetConfig['funnel_order_type'] })}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <div className="flex flex-col">
                        <span>{o.label}</span>
                        <span className="text-xs text-muted-foreground">{o.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <Separator />

            {/* Exclusion steps */}
            <section className="space-y-3">
              <div className="flex items-center gap-1">
                <SectionHeader icon={Ban} label={t('exclusions')} />
                <InfoTooltip content={t('exclusionsTooltip')} />
              </div>
              <FunnelExclusionBuilder
                exclusions={config.exclusions ?? []}
                onChange={(exclusions) => onChange({ ...config, exclusions })}
                stepCount={config.steps.length}
              />
            </section>

            <Separator />

            {/* Sampling */}
            <section className="space-y-3">
              <div className="flex items-center gap-1">
                <SectionHeader icon={FlaskConical} label={t('sampling')} />
                <InfoTooltip content={t('samplingTooltip')} />
              </div>
              <PillToggleGroup
                options={samplingOptions}
                value={String(config.sampling_factor ?? 1)}
                onChange={(v) => onChange({ ...config, sampling_factor: Number(v) === 1 ? undefined : Number(v) })}
              />
            </section>
          </CollapsibleContent>
        </Collapsible>
    </QueryPanelShell>
  );
}
