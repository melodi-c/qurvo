import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryItemCard, useDragReorder } from '../QueryItemCard';
import type { TrendSeries, StepFilter } from '@/api/generated/Api';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendSeriesBuilder.translations';

const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500'];

interface TrendSeriesBuilderProps {
  series: TrendSeries[];
  onChange: (series: TrendSeries[]) => void;
}

export function TrendSeriesBuilder({ series, onChange }: TrendSeriesBuilderProps) {
  const { t } = useLocalTranslation(translations);
  const drag = useDragReorder(series, onChange);

  const update = (idx: number, patch: Partial<TrendSeries>) => {
    onChange(series.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addSeries = () => {
    if (series.length >= 5) return;
    onChange([...series, { event_name: '', label: `Series ${series.length + 1}` }]);
  };

  const removeSeries = (idx: number) => {
    if (series.length <= 1) return;
    onChange(series.filter((_, i) => i !== idx));
  };

  const addFilter = (idx: number) => {
    const filters: StepFilter[] = [...(series[idx].filters ?? []), { property: '', operator: 'eq', value: '' }];
    update(idx, { filters });
  };

  const updateFilter = (seriesIdx: number, filterIdx: number, f: StepFilter) => {
    const filters = (series[seriesIdx].filters ?? []).map((existing, i) => (i === filterIdx ? f : existing));
    update(seriesIdx, { filters });
  };

  const removeFilter = (seriesIdx: number, filterIdx: number) => {
    const filters = (series[seriesIdx].filters ?? []).filter((_, i) => i !== filterIdx);
    update(seriesIdx, { filters });
  };

  return (
    <div className="space-y-2">
      {series.map((s, idx) => (
        <QueryItemCard
          key={idx}
          item={s}
          index={idx}
          badge={<div className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLORS[idx % COLORS.length]}`} />}
          labelPlaceholder="Label"
          canRemove={series.length > 1}
          onLabelChange={(label) => update(idx, { label })}
          onEventChange={(event_name) => update(idx, { event_name })}
          onRemove={() => removeSeries(idx)}
          onFilterAdd={() => addFilter(idx)}
          onFilterChange={(fi, f) => updateFilter(idx, fi, f)}
          onFilterRemove={(fi) => removeFilter(idx, fi)}
          draggable
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
