import { DatePicker } from '@/components/ui/date-picker';
import { DatePresetButtons } from '@/components/ui/date-preset-buttons';

interface WebFilterBarProps {
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
}

export function WebFilterBar({ dateFrom, dateTo, onDateRangeChange }: WebFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DatePresetButtons
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={onDateRangeChange}
        className="flex-wrap"
      />
      <div className="flex items-center gap-1.5">
        <DatePicker
          value={dateFrom.slice(0, 10)}
          onChange={(v) => onDateRangeChange(v, dateTo)}
        />
        <span className="text-xs text-muted-foreground">—</span>
        <DatePicker
          value={dateTo.slice(0, 10)}
          onChange={(v) => onDateRangeChange(dateFrom, v)}
        />
      </div>
    </div>
  );
}
