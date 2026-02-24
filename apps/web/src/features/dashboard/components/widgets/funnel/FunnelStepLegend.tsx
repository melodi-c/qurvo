export interface StepLegendProps {
  stepNum: number;
  label: string;
  eventName: string;
  count: number;
  conversionRate: number;
  dropOff: number;
  dropOffRate: number;
  isFirst: boolean;
  isLast: boolean;
  compact: boolean;
}

/** Step legend below a column. */
export function StepLegend({
  stepNum,
  label,
  eventName,
  count,
  conversionRate,
  dropOff,
  dropOffRate,
  isFirst,
  isLast,
  compact,
}: StepLegendProps) {
  const displayName = label || eventName;
  const showEvent = label && label !== eventName;

  if (compact) {
    return (
      <div className="pt-2 pb-1 px-1">
        <div className="flex items-center gap-1 mb-0.5">
          <div className="w-4 h-4 rounded-full bg-muted/60 text-[9px] font-bold flex items-center justify-center shrink-0 text-muted-foreground">
            {stepNum}
          </div>
          <p className="text-[10px] font-medium text-foreground leading-tight truncate max-w-[80px]">{displayName}</p>
        </div>

        <div className="space-y-0.5 pl-5">
          <div className="flex items-center gap-1 text-emerald-500">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[10px] font-semibold tabular-nums text-foreground">{count.toLocaleString()}</span>
            {!isFirst && <span className="text-[9px] text-muted-foreground">({conversionRate}%)</span>}
          </div>

          {!isFirst && !isLast && dropOff > 0 && (
            <div className="flex items-center gap-1 text-red-400">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <path d="M2 5h10M8 9l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{dropOff.toLocaleString()}</span>
              <span className="text-[9px] text-muted-foreground">({dropOffRate}%)</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-3 pb-1">
      {/* Step number + name */}
      <div className="flex items-start gap-1.5 mb-2">
        <div className="w-5 h-5 rounded-full bg-muted/60 text-[10px] font-bold flex items-center justify-center shrink-0 mt-px text-muted-foreground">
          {stepNum}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-foreground leading-tight break-words">{displayName}</p>
          {showEvent && (
            <p className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5 break-words">{eventName}</p>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-0.5 pl-[26px]">
        <div className="flex items-center gap-1.5 text-emerald-500">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[12px] font-semibold tabular-nums text-foreground">{count.toLocaleString()}</span>
          {!isFirst && <span className="text-[11px] text-muted-foreground">({conversionRate}%)</span>}
        </div>

        {!isFirst && !isLast && dropOff > 0 && (
          <div className="flex items-center gap-1.5 text-red-400">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <path d="M2 5h10M8 9l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[12px] font-medium tabular-nums text-muted-foreground">{dropOff.toLocaleString()}</span>
            <span className="text-[11px] text-muted-foreground">({dropOffRate}%)</span>
          </div>
        )}
      </div>
    </div>
  );
}
