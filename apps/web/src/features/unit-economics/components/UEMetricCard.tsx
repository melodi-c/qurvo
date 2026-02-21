import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface UEMetricCardProps {
  label: string;
  value: string;
  formula?: string;
  accent?: 'positive' | 'negative' | 'neutral';
}

export function UEMetricCard({ label, value, formula, accent }: UEMetricCardProps) {
  const card = (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide">
        {label}
      </p>
      <p
        className={cn(
          'text-xl font-bold tabular-nums',
          accent === 'positive' && 'text-emerald-400',
          accent === 'negative' && 'text-red-400',
          !accent && 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );

  if (!formula) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom" className="font-mono text-xs max-w-[250px]">
        {formula}
      </TooltipContent>
    </Tooltip>
  );
}
