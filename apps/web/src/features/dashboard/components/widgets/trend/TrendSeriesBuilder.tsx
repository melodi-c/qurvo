import { Plus, GripVertical, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventNameCombobox } from '../funnel/EventNameCombobox';
import { StepFilterRow } from '../funnel/StepFilterRow';
import type { TrendSeries, StepFilter } from '@/api/generated/Api';

const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500'];

interface TrendSeriesBuilderProps {
  series: TrendSeries[];
  onChange: (series: TrendSeries[]) => void;
}

export function TrendSeriesBuilder({ series, onChange }: TrendSeriesBuilderProps) {
  const update = (idx: number, patch: Partial<TrendSeries>) => {
    const next = series.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
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
    const s = series[idx];
    const filters: StepFilter[] = [...(s.filters ?? []), { property: '', operator: 'eq', value: '' }];
    update(idx, { filters });
  };

  const updateFilter = (seriesIdx: number, filterIdx: number, f: StepFilter) => {
    const s = series[seriesIdx];
    const filters = (s.filters ?? []).map((existing, i) => (i === filterIdx ? f : existing));
    update(seriesIdx, { filters });
  };

  const removeFilter = (seriesIdx: number, filterIdx: number) => {
    const s = series[seriesIdx];
    const filters = (s.filters ?? []).filter((_, i) => i !== filterIdx);
    update(seriesIdx, { filters });
  };

  return (
    <div className="space-y-2">
      {series.map((s, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-border/70 bg-muted/20"
        >
          {/* Header */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/40">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLORS[idx % COLORS.length]}`} />
            <Input
              value={s.label}
              onChange={(e) => update(idx, { label: e.target.value })}
              className="h-6 flex-1 border-0 bg-transparent text-xs font-medium shadow-none p-0 focus-visible:ring-0"
              placeholder="Label"
            />
            {series.length > 1 && (
              <button
                type="button"
                onClick={() => removeSeries(idx)}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Event name */}
          <div className="px-2 py-1.5">
            <EventNameCombobox
              value={s.event_name}
              onChange={(v) => update(idx, { event_name: v })}
              placeholder="Select event..."
            />
          </div>

          {/* Filters */}
          {(s.filters ?? []).length > 0 && (
            <div className="px-2 pb-1.5 space-y-1.5">
              {(s.filters ?? []).map((f, fi) => (
                <StepFilterRow
                  key={fi}
                  filter={f}
                  onChange={(updated) => updateFilter(idx, fi, updated)}
                  onRemove={() => removeFilter(idx, fi)}
                />
              ))}
            </div>
          )}

          {/* Add filter button */}
          <div className="px-2 pb-2">
            <button
              type="button"
              onClick={() => addFilter(idx)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <Filter className="h-3 w-3" />
              Add filter
            </button>
          </div>
        </div>
      ))}

      {series.length < 5 && (
        <Button
          variant="outline"
          size="sm"
          onClick={addSeries}
          className="w-full text-xs h-7"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add series
        </Button>
      )}
    </div>
  );
}
