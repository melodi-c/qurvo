import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
}

/**
 * Relative progress bar rendered via inline style.
 * Designed to be used as an absolutely-positioned background fill inside
 * a `position: relative` row container.
 *
 * Usage:
 *   <div className="relative ...">
 *     <ProgressBar value={row.visitors} max={maxVisitors} />
 *     <span>{row.name}</span>
 *   </div>
 */
export function ProgressBar({ value, max, className }: ProgressBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;

  return (
    <div
      className={cn('absolute inset-y-0 left-0 rounded-md bg-primary/5', className)}
      style={{ width: `${pct}%` }}
    />
  );
}
