import { useRef, useState, type ReactNode } from 'react';
import { GripVertical, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { EventNameCombobox } from './funnel/EventNameCombobox';
import { StepFilterRow } from './funnel/StepFilterRow';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import translations from './QueryItemCard.translations';
import type { StepFilter } from '@/api/generated/Api';

export interface QueryItem {
  event_name: string;
  event_names?: string[];
  label?: string;
  filters?: StepFilter[];
}

interface QueryItemCardProps {
  /** The item data (step or series) */
  item: QueryItem;
  /** Zero-based index */
  index: number;
  /** Left-side badge: number, colored dot, etc. */
  badge: ReactNode;
  /** Placeholder for the label input */
  labelPlaceholder?: string;
  /** Whether the remove button is disabled (e.g. min items reached) */
  canRemove: boolean;

  onLabelChange: (label: string) => void;
  onEventChange: (event: string) => void;
  /** OR-event names support */
  onEventNamesChange?: (names: string[]) => void;
  onRemove: () => void;
  onFilterAdd: () => void;
  onFilterChange: (filterIdx: number, filter: StepFilter) => void;
  onFilterRemove: (filterIdx: number) => void;

  /** Drag-and-drop support */
  draggable?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
}

export function QueryItemCard({
  item,
  badge,
  labelPlaceholder = 'Label',
  canRemove,
  onLabelChange,
  onEventChange,
  onEventNamesChange,
  onRemove,
  onFilterAdd,
  onFilterChange,
  onFilterRemove,
  draggable,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
}: QueryItemCardProps) {
  const { t } = useLocalTranslation(translations);
  const filters = item.filters ?? [];
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames(item.event_name);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isDragOver
          ? 'border-primary/50 bg-primary/5'
          : 'border-border/70 bg-muted/20'
      }`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {/* Header: grip + badge + label (with delete inside) */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/40">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing" />
        {badge}
        <div className="flex items-center flex-1 min-w-0 rounded-sm border border-border/60 bg-muted/30">
          <Input
            value={item.label ?? ''}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder={labelPlaceholder}
            className="h-7 flex-1 min-w-0 border-0 bg-transparent text-xs font-medium shadow-none px-2 focus-visible:ring-0"
          />
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Event name */}
      <div className="px-2 py-1.5 space-y-1.5">
        <EventNameCombobox
          value={item.event_name}
          onChange={onEventChange}
          placeholder={t('selectEvent')}
        />

        {/* OR event names */}
        {onEventNamesChange && (item.event_names ?? []).map((name, ei) => (
          <div key={ei} className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground/60 w-5 text-center shrink-0">or</span>
            <EventNameCombobox
              value={name}
              onChange={(v) => {
                const next = [...(item.event_names ?? [])];
                next[ei] = v;
                onEventNamesChange(next);
              }}
              placeholder={t('selectEvent')}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => onEventNamesChange((item.event_names ?? []).filter((_, idx) => idx !== ei))}
              className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground/40 transition-colors hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {onEventNamesChange && (
          <button
            type="button"
            onClick={() => onEventNamesChange([...(item.event_names ?? []), ''])}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t('addOrEvent')}
          </button>
        )}
      </div>

      {/* Filters */}
      {filters.length > 0 && (
        <div className="px-2 pb-1.5 space-y-1.5">
          {filters.map((f, fi) => (
            <StepFilterRow
              key={fi}
              filter={f}
              onChange={(updated) => onFilterChange(fi, updated)}
              onRemove={() => onFilterRemove(fi)}
              propertyNames={propertyNames}
              propertyDescriptions={propDescriptions}
            />
          ))}
        </div>
      )}

      {/* Add filter */}
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={onFilterAdd}
          className="flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('addFilter')}
        </button>
      </div>
    </div>
  );
}

// ── Drag hook ──

export function useDragReorder<T>(items: T[], onChange: (items: T[]) => void) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const handleDragStart = (i: number, e: React.DragEvent<HTMLDivElement>) => {
    setDragIdx(i);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4';
    });
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const next = [...items];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      onChange(next);
    }
    setDragIdx(null);
    setOverIdx(null);
    dragNode.current = null;
  };

  const handleDragOver = (i: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx !== null && i !== overIdx) {
      setOverIdx(i);
    }
  };

  const handleDragLeave = (i: number) => {
    if (overIdx === i) setOverIdx(null);
  };

  return {
    dragIdx,
    overIdx,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
  };
}
