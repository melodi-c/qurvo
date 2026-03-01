import { cn } from '@/lib/utils';
import { ANCHOR_PRESETS, DATE_PRESETS, getActivePreset, todayIso } from '@/lib/date-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './date-preset-buttons.translations';

interface DatePresetButtonsProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

export function DatePresetButtons({ dateFrom, dateTo, onChange, className }: DatePresetButtonsProps) {
  const { t } = useLocalTranslation(translations);
  const activePreset = getActivePreset(dateFrom, dateTo);

  return (
    <div className={cn('flex gap-1 flex-wrap', className)}>
      {DATE_PRESETS.map(({ label, relative }) => (
        <button
          key={relative}
          type="button"
          onClick={() => onChange(relative, todayIso())}
          className={cn(
            'rounded-md border px-2.5 py-2 sm:py-1 text-xs font-medium transition-colors',
            activePreset === relative
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
      {ANCHOR_PRESETS.map(({ labelKey, relative }) => (
        <button
          key={relative}
          type="button"
          onClick={() => onChange(relative, todayIso())}
          className={cn(
            'rounded-md border px-2.5 py-2 sm:py-1 text-xs font-medium transition-colors',
            activePreset === relative
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          {t(labelKey as 'mtd' | 'ytd')}
        </button>
      ))}
    </div>
  );
}
