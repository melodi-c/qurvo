import { cn } from '@/lib/utils';
import { DATE_PRESETS, daysAgoIso, getActivePreset, todayIso } from '@/lib/date-utils';

interface DatePresetButtonsProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

export function DatePresetButtons({ dateFrom, dateTo, onChange, className }: DatePresetButtonsProps) {
  const activePreset = getActivePreset(dateFrom, dateTo);
  return (
    <div className={cn('flex gap-1 flex-wrap', className)}>
      {DATE_PRESETS.map(({ label, days }) => (
        <button
          key={days}
          type="button"
          onClick={() => onChange(daysAgoIso(days), todayIso())}
          className={cn(
            'rounded-md border px-2.5 py-2 sm:py-1 text-xs font-medium transition-colors',
            activePreset === days
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
