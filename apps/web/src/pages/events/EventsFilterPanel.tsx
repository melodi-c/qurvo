import { X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { FilterListSection } from '@/components/FilterListSection';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './EventsFilterPanel.translations';
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
  const { t } = useLocalTranslation(translations);
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames(eventName);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      {/* Event name + clear */}
      <section className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">{t('event')}</span>
        <div className="flex items-center rounded-sm border border-border/60 bg-muted/30">
          <EventNameCombobox
            value={eventName}
            onChange={onEventNameChange}
            placeholder={t('allEvents')}
            className="min-w-0 flex-1 border-0 bg-transparent"
          />
          {eventName && (
            <button
              type="button"
              onClick={() => onEventNameChange('')}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-destructive"
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

      <FilterListSection
        label={t('filters')}
        addLabel={t('addFilter')}
        filters={filters}
        onFiltersChange={onFiltersChange}
        propertyNames={propertyNames}
        propertyDescriptions={propDescriptions}
      />
    </div>
  );
}
