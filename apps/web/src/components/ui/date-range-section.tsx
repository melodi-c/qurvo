import { CalendarDays } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePresetButtons } from '@/components/ui/date-preset-buttons';
import { SectionHeader } from '@/components/ui/section-header';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './date-range-section.translations';

interface DateRangeSectionProps {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
}

export function DateRangeSection({ dateFrom, dateTo, onChange }: DateRangeSectionProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <section className="space-y-3">
      <SectionHeader icon={CalendarDays} label={t('dateRange')} />
      <DatePresetButtons dateFrom={dateFrom} dateTo={dateTo} onChange={onChange} />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{t('from')}</span>
          <DatePicker
            value={dateFrom.slice(0, 10)}
            onChange={(v) => onChange(v, dateTo)}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{t('to')}</span>
          <DatePicker
            value={dateTo.slice(0, 10)}
            onChange={(v) => onChange(dateFrom, v)}
          />
        </div>
      </div>
    </section>
  );
}
