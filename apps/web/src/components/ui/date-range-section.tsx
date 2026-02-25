import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { SectionHeader } from '@/components/ui/section-header';
import { daysAgoIso, todayIso } from '@/lib/date-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './date-range-section.translations';

const DATE_PRESETS = [
  { label: '7d', value: '7', days: 7 },
  { label: '30d', value: '30', days: 30 },
  { label: '90d', value: '90', days: 90 },
  { label: '6m', value: '180', days: 180 },
  { label: '1y', value: '365', days: 365 },
] as const;

function getActivePreset(dateFrom: string, dateTo: string): string | undefined {
  for (const preset of DATE_PRESETS) {
    if (dateFrom.slice(0, 10) === daysAgoIso(preset.days) && dateTo.slice(0, 10) === todayIso()) {
      return preset.value;
    }
  }
  return undefined;
}

interface DateRangeSectionProps {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
}

export function DateRangeSection({ dateFrom, dateTo, onChange }: DateRangeSectionProps) {
  const { t } = useLocalTranslation(translations);
  const activePreset = getActivePreset(dateFrom, dateTo);

  return (
    <section className="space-y-3">
      <SectionHeader icon={CalendarDays} label={t('dateRange')} />
      <div className="flex gap-1 flex-wrap">
        {DATE_PRESETS.map(({ label, value, days }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(daysAgoIso(days), todayIso())}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              activePreset === value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
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
