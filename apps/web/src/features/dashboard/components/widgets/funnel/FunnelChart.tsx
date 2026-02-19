import { useState } from 'react';
import type { FunnelStepResult } from '@/api/generated/Api';

interface FunnelChartProps {
  steps: FunnelStepResult[];
}

function formatSeconds(s: number | null | undefined): string | null {
  if (s == null) return null;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

const BAR_AREA_H = 240;

interface TooltipProps {
  step: FunnelStepResult;
  stepConv: number | null;
}

function StepTooltip({ step, stepConv }: TooltipProps) {
  const time = formatSeconds(step.avg_time_to_convert_seconds);
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-20 pointer-events-none">
      <div className="bg-popover border border-border rounded-lg shadow-xl px-3.5 py-3 text-left min-w-[170px]">
        <p className="text-[12px] font-semibold text-foreground mb-2 truncate">{step.label || step.event_name}</p>
        <div className="space-y-1">
          <Row label="Users" value={step.count.toLocaleString()} />
          <Row label="From step 1" value={`${step.conversion_rate}%`} />
          {stepConv !== null && <Row label="From prev step" value={`${stepConv}%`} />}
          {step.drop_off > 0 && <Row label="Dropped off" value={step.drop_off.toLocaleString()} muted />}
          {time && <Row label="Avg time" value={time} />}
        </div>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-border" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-[-1px] w-0 h-0 border-x-[4px] border-x-transparent border-t-[4px] border-t-popover" />
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-medium tabular-nums ${muted ? 'text-muted-foreground/60' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

export function FunnelChart({ steps }: FunnelChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (steps.length === 0) return null;

  const first = steps[0].count;

  // Pre-compute step-to-step conversions
  const stepConvs = steps.map((step, i) => {
    if (i === 0) return null;
    const prev = steps[i - 1];
    return prev.count > 0 ? Math.round((step.count / prev.count) * 1000) / 10 : 0;
  });

  return (
    <div className="w-full select-none">

      {/* ── Bar zone ─────────────────────────────────────────────── */}
      <div className="flex items-end gap-px w-full border-b border-border/25">
        {steps.map((step, i) => {
          const ratio = first > 0 ? step.count / first : 0;
          const barH = Math.max(Math.round(ratio * BAR_AREA_H), 3);
          const isHov = hovered === i;

          return (
            <div
              key={i}
              className="relative flex-1 min-w-0 flex flex-col items-center cursor-default"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip */}
              {isHov && <StepTooltip step={step} stepConv={stepConvs[i]} />}

              {/* Labels above bar */}
              <div className="mb-3 text-center">
                <div
                  className={`text-[15px] font-bold tabular-nums leading-tight transition-colors ${
                    isHov ? 'text-foreground' : 'text-foreground/85'
                  }`}
                >
                  {step.count.toLocaleString()}
                </div>
                <div
                  className={`text-[11px] tabular-nums leading-tight mt-0.5 transition-colors ${
                    isHov ? 'text-muted-foreground' : 'text-muted-foreground/50'
                  }`}
                >
                  {step.conversion_rate}%
                </div>
              </div>

              {/* Bar container — negative space at top is intentional */}
              <div className="relative w-full" style={{ height: BAR_AREA_H }}>
                {/* Filled portion — anchored to bottom */}
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-[3px] transition-all duration-100"
                  style={{
                    height: barH,
                    background: isHov
                      ? 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)'
                      : 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Label zone ─────────────────────────────────────────────── */}
      {/* Mirrors bar zone structure: same flex-1 columns + gap-px */}
      <div className="flex items-start gap-px w-full mt-0">
        {steps.map((step, i) => {
          const isHov = hovered === i;
          const conv = stepConvs[i];

          return (
            <div
              key={i}
              className="flex-1 min-w-0 flex flex-col items-center pt-2.5 pb-1 cursor-default"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Step-to-step conversion badge — shown above label for all except first */}
              {conv !== null ? (
                <div className="mb-2 flex items-center gap-1">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="shrink-0">
                    <path
                      d="M0 4h7M5 1.5l3 2.5-3 2.5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground/30"
                    />
                  </svg>
                  <span className="text-[10px] font-medium text-muted-foreground/50 tabular-nums">
                    {conv}%
                  </span>
                </div>
              ) : (
                <div className="mb-2 h-[18px]" /> /* placeholder for first step */
              )}

              {/* Step label */}
              <span
                className={`text-[11px] font-medium text-center leading-snug transition-colors break-words px-1 ${
                  isHov ? 'text-foreground' : 'text-muted-foreground/70'
                }`}
              >
                {step.label || step.event_name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
