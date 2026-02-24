import { useLocalTranslation } from '@/hooks/use-local-translation';
import { formatSeconds } from '@/lib/formatting';
import translations from './FunnelChart.translations';
import type { FunnelStepResult } from '@/api/generated/Api';

/** Tooltip row. */
export function TRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-medium tabular-nums ${muted ? 'text-muted-foreground/60' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

/** Tooltip card shown on bar hover. */
export function BarTooltip({
  step,
  stepConv,
  title,
}: {
  step: FunnelStepResult;
  stepConv: number | null;
  title?: string;
}) {
  const { t } = useLocalTranslation(translations);
  const time = formatSeconds(step.avg_time_to_convert_seconds);
  return (
    <div className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div className="bg-popover border border-border rounded-lg shadow-xl px-3.5 py-3 min-w-[165px]">
        <p className="text-[12px] font-semibold text-foreground mb-2 leading-snug">
          {title ?? step.label ?? step.event_name}
        </p>
        <div className="space-y-1">
          <TRow label={t('users')} value={step.count.toLocaleString()} />
          <TRow label={t('fromStep1')} value={`${step.conversion_rate}%`} />
          {stepConv !== null && <TRow label={t('fromPrev')} value={`${stepConv}%`} />}
          {step.drop_off > 0 && <TRow label={t('dropped')} value={step.drop_off.toLocaleString()} muted />}
          {time && <TRow label={t('avgTime')} value={time} />}
        </div>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-border" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-[-1px] w-0 h-0 border-x-[4px] border-x-transparent border-t-[4px] border-t-popover" />
      </div>
    </div>
  );
}
