import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePresetButtons } from '@/components/ui/date-preset-buttons';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './WebFilterBar.translations';

interface WebFilterBarProps {
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  className?: string;
}

export function WebFilterBar({ dateFrom, dateTo, onDateRangeChange, className }: WebFilterBarProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap', className)}>
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
  );
}
