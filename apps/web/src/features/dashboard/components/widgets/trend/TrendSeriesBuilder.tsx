import { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PropertyNameCombobox } from '@/components/PropertyNameCombobox';
import { QueryItemCard } from '../QueryItemCard';
import { useDragReorder } from '@/hooks/use-drag-reorder';
import { useFilterManager } from '@/hooks/use-filter-manager';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import type { TrendSeries, TrendMetric, StepFilter } from '@/api/generated/Api';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { SERIES_LETTERS } from './trend-shared';
import { CHART_COLORS_TW } from '@/lib/chart-colors';
import translations from './TrendSeriesBuilder.translations';

const COLORS = CHART_COLORS_TW;

interface TrendSeriesBuilderProps {
  series: TrendSeries[];
  onChange: (seriesOrUpdater: TrendSeries[] | ((prev: TrendSeries[]) => TrendSeries[])) => void;
}

export function TrendSeriesBuilder({ series, onChange }: TrendSeriesBuilderProps) {
  const { t } = useLocalTranslation(translations);
  const drag = useDragReorder(series, onChange);

  const metricOptions = useMemo(() => [
    { value: 'total_events', label: t('totalEvents'), desc: t('totalEventsDesc') },
    { value: 'unique_users', label: t('uniqueUsers'), desc: t('uniqueUsersDesc') },
    { value: 'events_per_user', label: t('eventsPerUser'), desc: t('eventsPerUserDesc') },
    { value: 'first_time_users', label: t('firstTimeUsers'), desc: t('firstTimeUsersDesc') },
    { value: 'property_sum', label: t('propertySum'), desc: t('propertyAggDesc') },
    { value: 'property_avg', label: t('propertyAvg'), desc: t('propertyAggDesc') },
    { value: 'property_min', label: t('propertyMin'), desc: t('propertyAggDesc') },
    { value: 'property_max', label: t('propertyMax'), desc: t('propertyAggDesc') },
  ], [t]);

  const update = useCallback(
    (idx: number, patch: Partial<TrendSeries>) => {
      onChange((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    },
    [onChange],
  );

  const onChangeAll = useCallback(
    (updater: (prev: TrendSeries[]) => TrendSeries[]) => onChange(updater),
    [onChange],
  );
  const { addFilter, updateFilter, removeFilter } = useFilterManager(onChangeAll);

  const addSeries = () => {
    onChange((prev) => {
      if (prev.length >= 5) {return prev;}
      return [...prev, { event_name: '', label: t('seriesN', { n: String(prev.length + 1) }), metric: 'total_events' as TrendMetric }];
    });
  };

  const duplicateSeries = (idx: number) => {
    onChange((prev) => {
      if (prev.length >= 5) {return prev;}
      const copy = { ...prev[idx], label: `${prev[idx].label || ''} ${t('copyLabel')}`.trim() };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  const removeSeries = (idx: number) => {
    onChange((prev) => {
      if (prev.length <= 1) {return prev;}
      return prev.filter((_, i) => i !== idx);
    });
  };

  return (
    <div className="space-y-2">
      {series.map((s, idx) => (
        <SeriesCard
          key={idx}
          series={s}
          index={idx}
          metricOptions={metricOptions}
          canRemove={series.length > 1}
          canDuplicate={series.length < 5}
          onUpdate={(patch) => update(idx, patch)}
          onRemove={() => removeSeries(idx)}
          onDuplicate={() => duplicateSeries(idx)}
          onFilterAdd={() => addFilter(idx)}
          onFilterChange={(fi, f) => updateFilter(idx, fi, f)}
          onFilterRemove={(fi) => removeFilter(idx, fi)}
          isDragOver={drag.overIdx === idx && drag.dragIdx !== null && drag.dragIdx !== idx}
          onDragStart={(e) => drag.handleDragStart(idx, e)}
          onDragEnd={drag.handleDragEnd}
          onDragOver={(e) => drag.handleDragOver(idx, e)}
          onDragLeave={() => drag.handleDragLeave(idx)}
        />
      ))}

      {series.length < 5 && (
        <Button
          variant="outline"
          size="sm"
          onClick={addSeries}
          className="w-full text-xs h-7"
        >
          <Plus className="h-3 w-3 mr-1" />
          {t('addSeries')}
        </Button>
      )}
    </div>
  );
}

/* ---------- Per-series card with metric selector ---------- */

interface MetricOption {
  value: string;
  label: string;
  desc: string;
}

interface SeriesCardProps {
  series: TrendSeries;
  index: number;
  metricOptions: MetricOption[];
  canRemove: boolean;
  canDuplicate: boolean;
  onUpdate: (patch: Partial<TrendSeries>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onFilterAdd: () => void;
  onFilterChange: (fi: number, f: StepFilter) => void;
  onFilterRemove: (fi: number) => void;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
}

function SeriesCard({
  series: s,
  index: idx,
  metricOptions,
  canRemove,
  canDuplicate,
  onUpdate,
  onRemove,
  onDuplicate,
  onFilterAdd,
  onFilterChange,
  onFilterRemove,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
}: SeriesCardProps) {
  const { t } = useLocalTranslation(translations);
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames();
  const isPropertyMetric = (s.metric ?? 'total_events').startsWith('property_');
  const customPropertyNames = useMemo(
    () => propertyNames.filter((n) => n.startsWith('properties.')),
    [propertyNames],
  );

  return (
    <div className="space-y-0">
      <QueryItemCard
        item={s}
        index={idx}
        badge={
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLORS[idx % COLORS.length]}`} />
            <span className="text-[10px] font-mono font-semibold text-muted-foreground leading-none">{SERIES_LETTERS[idx]}</span>
          </div>
        }
        labelPlaceholder={t('labelPlaceholder')}
        canRemove={canRemove}
        onLabelChange={(label) => onUpdate({ label })}
        onEventChange={(event_name) => onUpdate({ event_name })}
        onRemove={onRemove}
        onDuplicate={canDuplicate ? onDuplicate : undefined}
        onFilterAdd={onFilterAdd}
        onFilterChange={onFilterChange}
        onFilterRemove={onFilterRemove}
        draggable
        isDragOver={isDragOver}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {/* Per-series metric selector */}
        <div className="px-2 pb-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground/60 shrink-0">{t('metric')}</span>
            <Select
              value={s.metric ?? 'total_events'}
              onValueChange={(v) => {
                const next = v as TrendMetric;
                const wasProperty = (s.metric ?? 'total_events').startsWith('property_');
                const isProperty = next.startsWith('property_');
                onUpdate({
                  metric: next,
                  ...(!isProperty && wasProperty ? { metric_property: undefined } : {}),
                });
              }}
            >
              <SelectTrigger size="sm" className="h-7 flex-1 min-w-0 text-xs">
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

          {isPropertyMetric && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground/60 shrink-0">{t('metricProperty')}</span>
              <PropertyNameCombobox
                value={s.metric_property ?? ''}
                onChange={(v) => onUpdate({ metric_property: v || undefined })}
                propertyNames={customPropertyNames}
                descriptions={propDescriptions}
                className="h-7 flex-1"
              />
            </div>
          )}
        </div>
      </QueryItemCard>
    </div>
  );
}
