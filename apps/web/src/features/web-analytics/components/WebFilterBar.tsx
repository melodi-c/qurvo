import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePresetButtons } from '@/components/ui/date-preset-buttons';
import { Separator } from '@/components/ui/separator';
import { FilterListSection } from '@/components/FilterListSection';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { resolveRelativeDate, isRelativeDate } from '@/lib/date-utils';
import { useProjectStore } from '@/stores/project';
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
  const timezone = useProjectStore((s) => s.projectTimezone);

  // Resolve relative dates (e.g. "-7d", "-0d") to absolute YYYY-MM-DD for DatePicker
  const resolvedFrom = resolveRelativeDate(dateFrom, timezone);
  const resolvedTo = resolveRelativeDate(dateTo, timezone);

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
            value={resolvedFrom}
            onChange={(v) => onDateRangeChange(v, isRelativeDate(dateTo) ? resolvedTo : dateTo)}
          />
          <span className="text-xs text-muted-foreground">—</span>
          <span className="text-xs text-muted-foreground">{t('to')}:</span>
          <DatePicker
            value={resolvedTo}
            onChange={(v) => onDateRangeChange(isRelativeDate(dateFrom) ? resolvedFrom : dateFrom, v)}
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
