import { Filter, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { StepFilterRow } from '@/features/dashboard/components/widgets/funnel/StepFilterRow';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import type { StepFilter } from '@/api/generated/Api';

interface EventsFilterPanelProps {
  eventName: string;
  onEventNameChange: (value: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateChange: (from: string, to: string) => void;
  filters: StepFilter[];
  onFiltersChange: (filters: StepFilter[]) => void;
}

export function EventsFilterPanel({
  eventName,
  onEventNameChange,
  dateFrom,
  dateTo,
  onDateChange,
  filters,
  onFiltersChange,
}: EventsFilterPanelProps) {
  const { data: propertyNames = [] } = useEventPropertyNames(eventName);

  const addFilter = () =>
    onFiltersChange([...filters, { property: '', operator: 'eq', value: '' }]);

  const updateFilter = (i: number, f: StepFilter) =>
    onFiltersChange(filters.map((existing, idx) => (idx === i ? f : existing)));

  const removeFilter = (i: number) =>
    onFiltersChange(filters.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      {/* Event name + clear */}
      <section className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Event</span>
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <EventNameCombobox
              value={eventName}
              onChange={onEventNameChange}
              placeholder="All events"
            />
          </div>
          {eventName && (
            <button
              type="button"
              onClick={() => onEventNameChange('')}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </section>

      <Separator />

      <DateRangeSection
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={onDateChange}
      />

      <Separator />

      {/* Property filters */}
      <section className="space-y-3">
        <SectionHeader icon={Filter} label="Filters" />
        {filters.length > 0 && (
          <div className="space-y-2">
            {filters.map((f, i) => (
              <StepFilterRow
                key={i}
                filter={f}
                onChange={(updated) => updateFilter(i, updated)}
                onRemove={() => removeFilter(i)}
                propertyNames={propertyNames}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addFilter}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Filter className="h-3 w-3" />
          Add filter
        </button>
      </section>
    </div>
  );
}
