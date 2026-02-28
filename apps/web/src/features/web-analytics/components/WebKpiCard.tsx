import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { STATUS_COLORS } from '@/lib/chart-colors';
import translations from './WebKpiCard.translations';

interface WebKpiCardProps {
  label: string;
  value: string;
  previousValue: number;
  currentValue: number;
  formatDelta?: (current: number, previous: number) => string;
  invertSentiment?: boolean;
}

function defaultFormatDelta(current: number, previous: number): string {
  if (previous === 0) {return current > 0 ? '+100%' : '0%';}
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function WebKpiCard({
  label,
  value,
  previousValue,
  currentValue,
  formatDelta = defaultFormatDelta,
  invertSentiment = false,
}: WebKpiCardProps) {
  const { t } = useLocalTranslation(translations);
  const delta = formatDelta(currentValue, previousValue);
  const increased = currentValue >= previousValue;
  const isNeutral = currentValue === previousValue;
  const isGood = invertSentiment ? !increased : increased;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {!isNeutral && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            isGood ? STATUS_COLORS.positive : STATUS_COLORS.negative,
          )}
        >
          {increased ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )}
          <span>{delta}</span>
          <span className="text-muted-foreground/50">{t('vsPrev')}</span>
        </div>
      )}
    </div>
  );
}
