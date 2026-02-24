import { useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  ArrowLeftRight,
  FunctionSquare,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { CohortFilterSection } from '@/components/ui/cohort-filter-section';
import { BreakdownSection } from '@/components/ui/breakdown-section';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { PropertyNameCombobox } from '@/components/PropertyNameCombobox';
import { TrendSeriesBuilder } from './TrendSeriesBuilder';
import { FormulaBuilder } from './FormulaBuilder';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendQueryPanel.translations';
import type { TrendWidgetConfig } from '@/api/generated/Api';

/** Breakdown fields used by the UI but not declared in the generated TrendWidgetConfig. */
type TrendConfig = TrendWidgetConfig & {
  breakdown_type?: 'property' | 'cohort';
  breakdown_cohort_ids?: string[];
};

interface TrendQueryPanelProps {
  config: TrendConfig;
  onChange: (config: TrendConfig) => void;
}

export function TrendQueryPanel({ config, onChange }: TrendQueryPanelProps) {
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames();
  const { t } = useLocalTranslation(translations);

  const metricOptions = useMemo(() => [
    { value: 'total_events', label: t('totalEvents') },
    { value: 'unique_users', label: t('uniqueUsers') },
    { value: 'events_per_user', label: t('eventsPerUser') },
    { value: 'property_sum', label: t('propertySum') },
    { value: 'property_avg', label: t('propertyAvg') },
    { value: 'property_min', label: t('propertyMin') },
    { value: 'property_max', label: t('propertyMax') },
  ], [t]);

  const isPropertyMetric = config.metric.startsWith('property_');
  const customPropertyNames = useMemo(
    () => propertyNames.filter((n) => n.startsWith('properties.')),
    [propertyNames],
  );

  const granularityOptions = useMemo(() => [
    { value: 'hour', label: t('hour') },
    { value: 'day', label: t('day') },
    { value: 'week', label: t('week') },
    { value: 'month', label: t('month') },
  ], [t]);

  const chartTypeOptions = useMemo(() => [
    { value: 'line', label: t('line') },
    { value: 'bar', label: t('bar') },
  ], [t]);

  return (
    <QueryPanelShell>

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange({ ...config, date_from, date_to })}
        />

        <Separator />

        {/* Series */}
        <section className="space-y-3">
          <SectionHeader icon={TrendingUp} label={t('series')} />
          <TrendSeriesBuilder
            series={config.series}
            onChange={(series) => onChange({ ...config, series })}
          />
        </section>

        <Separator />

        {/* Formulas */}
        <section className="space-y-3">
          <SectionHeader icon={FunctionSquare} label={t('formulas')} />
          <FormulaBuilder
            formulas={config.formulas ?? []}
            seriesCount={config.series.length}
            onChange={(formulas) => onChange({ ...config, formulas: formulas.length ? formulas : undefined })}
          />
        </section>

        <Separator />

        {/* Metric + Granularity */}
        <section className="space-y-3">
          <SectionHeader icon={BarChart3} label={t('display')} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('metric')}</span>
              <Select
                value={config.metric}
                onValueChange={(v) => {
                  const next = v as TrendWidgetConfig['metric'];
                  const wasProperty = config.metric.startsWith('property_');
                  const isProperty = next.startsWith('property_');
                  onChange({
                    ...config,
                    metric: next,
                    ...(!isProperty && wasProperty ? { metric_property: undefined } : {}),
                  });
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-sm">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('granularity')}</span>
              <Select
                value={config.granularity}
                onValueChange={(v) => onChange({ ...config, granularity: v as TrendWidgetConfig['granularity'] })}
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
          </div>

          {/* Property selector for property_* metrics */}
          {isPropertyMetric && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('metricProperty')}</span>
              <PropertyNameCombobox
                value={config.metric_property ?? ''}
                onChange={(v) => onChange({ ...config, metric_property: v || undefined })}
                propertyNames={customPropertyNames}
                descriptions={propDescriptions}
                className="h-8"
              />
            </div>
          )}

          {/* Chart type */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{t('chartType')}</span>
            <PillToggleGroup
              options={chartTypeOptions}
              value={config.chart_type}
              onChange={(v) => onChange({ ...config, chart_type: v as TrendWidgetConfig['chart_type'] })}
            />
          </div>
        </section>

        <Separator />

        {/* Compare */}
        <section className="space-y-3">
          <SectionHeader icon={ArrowLeftRight} label={t('compare')} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.compare}
              onChange={(e) => onChange({ ...config, compare: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">{t('compareToPrevious')}</span>
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
    </QueryPanelShell>
  );
}
