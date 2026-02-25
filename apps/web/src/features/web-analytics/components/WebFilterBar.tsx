import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePresetButtons } from '@/components/ui/date-preset-buttons';
import { Separator } from '@/components/ui/separator';
import { FilterListSection } from '@/components/FilterListSection';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './WebFilterBar.translations';
import type { StepFilter } from '@/api/generated/Api';

interface WebFilterBarProps {
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  filters: StepFilter[];
  onFiltersChange: (filters: StepFilter[]) => void;
  className?: string;
}

export function WebFilterBar({ dateFrom, dateTo, onDateRangeChange, filters, onFiltersChange, className }: WebFilterBarProps) {
  const { t } = useLocalTranslation(translations);
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames();

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
        <DatePresetButtons
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={onDateRangeChange}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('from')}:</span>
          <DatePicker
            value={dateFrom.slice(0, 10)}
            onChange={(v) => onDateRangeChange(v, dateTo)}
          />
          <span className="text-xs text-muted-foreground">—</span>
          <span className="text-xs text-muted-foreground">{t('to')}:</span>
          <DatePicker
            value={dateTo.slice(0, 10)}
            onChange={(v) => onDateRangeChange(dateFrom, v)}
          />
        </div>
      </div>
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
