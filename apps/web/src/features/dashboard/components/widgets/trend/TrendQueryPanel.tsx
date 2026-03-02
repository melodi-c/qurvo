import { useMemo, useCallback } from 'react';
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
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { PropertyNameCombobox } from '@/components/PropertyNameCombobox';
import { TrendSeriesBuilder } from './TrendSeriesBuilder';
import { FormulaBuilder } from './FormulaBuilder';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendQueryPanel.translations';
import type { TrendWidgetConfig, TrendSeries, TrendFormula } from '@/api/generated/Api';

interface TrendQueryPanelProps {
  config: TrendWidgetConfig;
  onChange: React.Dispatch<React.SetStateAction<TrendWidgetConfig>>;
}

export function TrendQueryPanel({ config, onChange }: TrendQueryPanelProps) {
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames();
  const { t } = useLocalTranslation(translations);

  const metricOptions = useMemo(() => [
    { value: 'total_events', label: t('totalEvents'), desc: t('totalEventsDesc') },
    { value: 'unique_users', label: t('uniqueUsers'), desc: t('uniqueUsersDesc') },
    { value: 'events_per_user', label: t('eventsPerUser'), desc: t('eventsPerUserDesc') },
    { value: 'property_sum', label: t('propertySum'), desc: t('propertyAggDesc') },
    { value: 'property_avg', label: t('propertyAvg'), desc: t('propertyAggDesc') },
    { value: 'property_min', label: t('propertyMin'), desc: t('propertyAggDesc') },
    { value: 'property_max', label: t('propertyMax'), desc: t('propertyAggDesc') },
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

  /** Wraps series changes (value or functional updater) into a config updater */
  const handleSeriesChange = useCallback(
    (seriesOrUpdater: TrendSeries[] | ((prev: TrendSeries[]) => TrendSeries[])) => {
      onChange((prev) => ({
        ...prev,
        series: typeof seriesOrUpdater === 'function'
          ? seriesOrUpdater(prev.series)
          : seriesOrUpdater,
      }));
    },
    [onChange],
  );

  /** Wraps formula changes (value or functional updater) into a config updater */
  const handleFormulasChange = useCallback(
    (formulasOrUpdater: TrendFormula[] | ((prev: TrendFormula[]) => TrendFormula[])) => {
      onChange((prev) => {
        const next = typeof formulasOrUpdater === 'function'
          ? formulasOrUpdater(prev.formulas ?? [])
          : formulasOrUpdater;
        return { ...prev, formulas: next.length ? next : undefined };
      });
    },
    [onChange],
  );

  return (
    <QueryPanelShell>

        <DateRangeSection
          dateFrom={config.date_from}
          dateTo={config.date_to}
          onChange={(date_from, date_to) => onChange((prev) => ({ ...prev, date_from, date_to }))}
        />

        <Separator />

        {/* Series */}
        <section className="space-y-3">
          <SectionHeader icon={TrendingUp} label={t('series')} />
          <TrendSeriesBuilder
            series={config.series}
            onChange={handleSeriesChange}
          />
        </section>

        <Separator />

        {/* Formulas */}
        <section className="space-y-3">
          <SectionHeader icon={FunctionSquare} label={t('formulas')} />
          <FormulaBuilder
            formulas={config.formulas ?? []}
            seriesCount={config.series.length}
            onChange={handleFormulasChange}
          />
        </section>

        <Separator />

        {/* Metric + Granularity */}
        <section className="space-y-3">
          <SectionHeader icon={BarChart3} label={t('display')} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{t('metric')}</span>
                <InfoTooltip content={t('metricTooltip')} />
              </div>
              <Select
                value={config.metric}
                onValueChange={(v) => {
                  const next = v as TrendWidgetConfig['metric'];
                  const wasProperty = config.metric.startsWith('property_');
                  const isProperty = next.startsWith('property_');
                  onChange((prev) => ({
                    ...prev,
                    metric: next,
                    ...(!isProperty && wasProperty ? { metric_property: undefined } : {}),
                  }));
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value} description={o.desc}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{t('granularity')}</span>
                <InfoTooltip content={t('granularityTooltip')} />
              </div>
              <Select
                value={config.granularity}
                onValueChange={(v) => onChange((prev) => ({ ...prev, granularity: v as TrendWidgetConfig['granularity'] }))}
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
                onChange={(v) => onChange((prev) => ({ ...prev, metric_property: v || undefined }))}
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
              onChange={(v) => onChange((prev) => ({ ...prev, chart_type: v as TrendWidgetConfig['chart_type'] }))}
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
              onChange={(e) => onChange((prev) => ({ ...prev, compare: e.target.checked }))}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">{t('compareToPrevious')}</span>
            <InfoTooltip content={t('compareTooltip')} />
          </label>
        </section>

        <Separator />

        <CohortFilterSection
          value={config.cohort_ids ?? []}
          onChange={(cohort_ids) => onChange((prev) => ({ ...prev, cohort_ids: cohort_ids.length ? cohort_ids : undefined }))}
        />

        <Separator />

        <BreakdownSection
          value={config.breakdown_property || ''}
          onChange={(v) => onChange((prev) => ({ ...prev, breakdown_property: v || undefined }))}
          propertyNames={propertyNames}
          propertyDescriptions={propDescriptions}
          breakdownType={config.breakdown_type ?? 'property'}
          onBreakdownTypeChange={(type) => onChange((prev) => ({
            ...prev,
            breakdown_type: type,
            ...(type === 'cohort' ? { breakdown_property: undefined } : { breakdown_cohort_ids: undefined }),
          }))}
          breakdownCohortIds={config.breakdown_cohort_ids ?? []}
          onBreakdownCohortIdsChange={(ids) => onChange((prev) => ({
            ...prev,
            breakdown_cohort_ids: ids.length ? ids : undefined,
          }))}
          tooltip={t('breakdownTooltip')}
        />
    </QueryPanelShell>
  );
}
