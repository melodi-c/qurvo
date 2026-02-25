import { DatePicker } from '@/components/ui/date-picker';
import { daysAgoIso, todayIso } from '@/lib/date-utils';

const DATE_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
] as const;

function getActivePreset(dateFrom: string, dateTo: string): number | undefined {
  for (const preset of DATE_PRESETS) {
    if (dateFrom.slice(0, 10) === daysAgoIso(preset.days) && dateTo.slice(0, 10) === todayIso()) {
      return preset.days;
    }
  }
  return undefined;
}

interface WebFilterBarProps {
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
}

export function WebFilterBar({ dateFrom, dateTo, onDateRangeChange }: WebFilterBarProps) {
  const activePreset = getActivePreset(dateFrom, dateTo);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        {DATE_PRESETS.map(({ label, days }) => (
          <button
            key={days}
            type="button"
            onClick={() => onDateRangeChange(daysAgoIso(days), todayIso())}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              activePreset === days
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
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
