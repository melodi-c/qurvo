import { DateRangeSection } from '@/components/ui/date-range-section';

interface WebFilterBarProps {
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
}

export function WebFilterBar({ dateFrom, dateTo, onDateRangeChange }: WebFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <DateRangeSection
        dateFrom={dateFrom}
        dateTo={dateTo}
        onChange={onDateRangeChange}
      />
    </div>
  );
}
