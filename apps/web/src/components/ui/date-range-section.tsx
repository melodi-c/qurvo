import { CalendarDays } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePresetButtons } from '@/components/ui/date-preset-buttons';
import { SectionHeader } from '@/components/ui/section-header';
import { resolveRelativeDate, isRelativeDate } from '@/lib/date-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './date-range-section.translations';

interface DateRangeSectionProps {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
}

export function DateRangeSection({ dateFrom, dateTo, onChange }: DateRangeSectionProps) {
  const { t } = useLocalTranslation(translations);

  // Resolve relative dates for display in the date picker
  const resolvedFrom = resolveRelativeDate(dateFrom);
  const resolvedTo = resolveRelativeDate(dateTo);

  return (
    <section className="space-y-3">
      <SectionHeader icon={CalendarDays} label={t('dateRange')} />
      <DatePresetButtons dateFrom={dateFrom} dateTo={dateTo} onChange={onChange} />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{t('from')}</span>
          <DatePicker
            value={resolvedFrom}
            onChange={(v) => {
              // Manual date picker selection stores absolute dates
              onChange(v, isRelativeDate(dateTo) ? resolveRelativeDate(dateTo) : dateTo);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{t('to')}</span>
          <DatePicker
            value={resolvedTo}
            onChange={(v) => {
              // Manual date picker selection stores absolute dates
              onChange(isRelativeDate(dateFrom) ? resolveRelativeDate(dateFrom) : dateFrom, v);
            }}
          />
        </div>
      </div>
    </section>
  );
}
