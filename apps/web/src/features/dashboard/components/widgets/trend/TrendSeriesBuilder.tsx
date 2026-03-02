import { useCallback, useRef } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryItemCard } from '../QueryItemCard';
import { useDragReorder } from '@/hooks/use-drag-reorder';
import { useFilterManager } from '@/hooks/use-filter-manager';
import type { TrendSeries } from '@/api/generated/Api';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { SERIES_LETTERS } from './trend-shared';
import { CHART_COLORS_TW } from '@/lib/chart-colors';
import translations from './TrendSeriesBuilder.translations';

const COLORS = CHART_COLORS_TW;

interface TrendSeriesBuilderProps {
  series: TrendSeries[];
  onChange: (series: TrendSeries[]) => void;
}

export function TrendSeriesBuilder({ series, onChange }: TrendSeriesBuilderProps) {
  const { t } = useLocalTranslation(translations);
  const drag = useDragReorder(series, onChange);

  const seriesRef = useRef(series);
  seriesRef.current = series;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const update = useCallback(
    (idx: number, patch: Partial<TrendSeries>) => {
      onChangeRef.current(seriesRef.current.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    },
    [],
  );

  const { addFilter, updateFilter, removeFilter } = useFilterManager(series, update);

  const addSeries = () => {
    if (seriesRef.current.length >= 5) {return;}
    onChangeRef.current([...seriesRef.current, { event_name: '', label: t('seriesN', { n: String(seriesRef.current.length + 1) }) }]);
  };

  const removeSeries = (idx: number) => {
    if (seriesRef.current.length <= 1) {return;}
    onChangeRef.current(seriesRef.current.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {series.map((s, idx) => (
        <QueryItemCard
          key={idx}
          item={s}
          index={idx}
          badge={
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLORS[idx % COLORS.length]}`} />
              <span className="text-[10px] font-mono font-semibold text-muted-foreground leading-none">{SERIES_LETTERS[idx]}</span>
            </div>
          }
          labelPlaceholder={t('labelPlaceholder')}
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
