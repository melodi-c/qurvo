import { useState } from 'react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './FunnelChart.translations';
import type { FunnelStepResult } from '@/api/generated/Api';

export interface FunnelChartProps {
  steps: FunnelStepResult[];
  breakdown?: boolean;
  aggregateSteps?: FunnelStepResult[];
  compact?: boolean;
}

// ── Constants & helpers ───────────────────────────────────────────────────────

const BAR_AREA_H_FULL = 240;
const BAR_AREA_H_COMPACT = 130;

/** Hex colors for breakdown series (no opacity needed — applied per-element). */
const SERIES_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

function formatSeconds(s: number | null | undefined): string | null {
  if (s == null) return null;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

/** PostHog bar-width ladder based on number of series. */
function barWidthPx(n: number, compact: boolean): number {
  const scale = compact ? 0.6 : 1;
  let base: number;
  if (n >= 20) base = 8;
  else if (n >= 12) base = 16;
  else if (n >= 8) base = 24;
  else if (n >= 6) base = 32;
  else if (n >= 5) base = 40;
  else if (n >= 4) base = 48;
  else if (n >= 3) base = 64;
  else if (n >= 2) base = 96;
  else base = 96;
  return Math.round(base * scale);
}

// ── Shared sub-components ─────────────────────────────────────────────────────

/** Y-axis percentage labels (100 → 0). */
function YAxis({ h }: { h: number }) {
  const labels = h > 150 ? ['100%', '80%', '60%', '40%', '20%', ''] : ['100%', '50%', ''];
  return (
    <div
      className="flex flex-col justify-between pr-3 shrink-0 select-none"
      style={{ height: h }}
    >
      {labels.map((l, i) => (
        <span key={i} className="text-[10px] font-medium text-muted-foreground/40 leading-none">
          {l}
        </span>
      ))}
    </div>
  );
}

/** Dashed horizontal grid lines. */
function GridLines({ h }: { h: number }) {
  const ticks = h > 150 ? [20, 40, 60, 80] : [50];
  return (
    <>
      {ticks.map((pct) => (
        <div
          key={pct}
          className="absolute inset-x-0 border-t border-dashed border-border/20 pointer-events-none"
          style={{ bottom: `${pct}%` }}
        />
      ))}
    </>
  );
}

/** Tooltip row. */
function TRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
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
function BarTooltip({
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

/**
 * A single PostHog-style bar: striped semi-transparent backdrop (full height,
 * represents drop-off space) + solid fill anchored to the bottom (conversion).
 */
function Bar({
  color,
  conversionRate,
  width,
  height,
  hovered,
}: {
  color: string;
  conversionRate: number;
  width: number;
  height: number;
  hovered: boolean;
}) {
  return (
    <div className="relative shrink-0 rounded-sm" style={{ width, height }}>
      {/* Backdrop — striped, full height, drop-off space */}
      <div
        className="absolute inset-0 rounded-sm transition-opacity duration-200"
        style={{
          background: `repeating-linear-gradient(
            -22.5deg,
            transparent, transparent 4px,
            rgba(255,255,255,0.28) 4px, rgba(255,255,255,0.28) 8px
          ), ${color}`,
          opacity: hovered ? 0.22 : 0.12,
        }}
      />
      {/* Fill — solid color, height = conversion rate */}
      <div
        className="absolute bottom-0 inset-x-0 rounded-sm transition-all duration-200"
        style={{
          height: `${Math.max(conversionRate, 0)}%`,
          background: color,
          filter: hovered ? 'brightness(0.85)' : 'none',
        }}
      />
    </div>
  );
}

/** Step legend below a column — full version. */
function StepLegend({
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
}: {
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
}) {
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

// ── Non-breakdown chart ───────────────────────────────────────────────────────

function PlainFunnel({ steps, compact }: { steps: FunnelStepResult[]; compact: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const color = SERIES_COLORS[0];
  const barH = compact ? BAR_AREA_H_COMPACT : BAR_AREA_H_FULL;
  const bw = barWidthPx(1, compact);

  const stepConvs = steps.map((s, i) => {
    if (i === 0) return null;
    const prev = steps[i - 1];
    return prev.count > 0 ? Math.round((s.count / prev.count) * 1000) / 10 : 0;
  });

  return (
    <div className="flex items-start gap-0 select-none">
      <YAxis h={barH} />

      {steps.map((step, i) => {
        const isFirst = i === 0;
        const isHov = hovered === i;

        return (
          <div key={i} className="flex flex-col shrink-0">
            {/* Bar column */}
            <div
              className={`relative ${compact ? 'px-2' : 'px-4'} ${!isFirst ? 'border-l border-dashed border-border/35' : ''}`}
              style={{ height: barH }}
            >
              <GridLines h={barH} />
              {/* Baseline */}
              <div className="absolute inset-x-0 bottom-0 border-t border-border/50 pointer-events-none" />

              <div
                className="relative z-10 flex items-end h-full cursor-default"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {isHov && <BarTooltip step={step} stepConv={stepConvs[i]} />}
                <Bar color={color} conversionRate={step.conversion_rate} width={bw} height={barH} hovered={isHov} />
              </div>
            </div>

            {/* Legend */}
            <div className={`${compact ? 'px-2' : 'px-4'} ${!isFirst ? 'border-l border-border/25' : ''}`}>
              <StepLegend
                stepNum={step.step}
                label={step.label}
                eventName={step.event_name}
                count={step.count}
                conversionRate={step.conversion_rate}
                dropOff={step.drop_off}
                dropOffRate={step.drop_off_rate}
                isFirst={isFirst}
                isLast={i === steps.length - 1}
                compact={compact}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Breakdown chart ───────────────────────────────────────────────────────────

function BreakdownFunnel({
  steps,
  aggregateSteps,
  compact,
}: {
  steps: FunnelStepResult[];
  aggregateSteps: FunnelStepResult[];
  compact: boolean;
}) {
  const [hovered, setHovered] = useState<{ si: number; gi: number } | null>(null);
  const barH = compact ? BAR_AREA_H_COMPACT : BAR_AREA_H_FULL;

  // Build: step_num → breakdown_value → FunnelStepResult
  const stepMap = new Map<number, Map<string, FunnelStepResult>>();
  const insertOrder: string[] = [];

  for (const s of steps) {
    const bv = s.breakdown_value ?? '(none)';
    if (!stepMap.has(s.step)) stepMap.set(s.step, new Map());
    stepMap.get(s.step)!.set(bv, s);
    if (!insertOrder.includes(bv)) insertOrder.push(bv);
  }

  const stepNums = [...stepMap.keys()].sort((a, b) => a - b);
  const step1Map = stepMap.get(stepNums[0]) ?? new Map();

  // Sort groups by step-1 count desc
  const groups = [...insertOrder].sort(
    (a, b) => (step1Map.get(b)?.count ?? 0) - (step1Map.get(a)?.count ?? 0),
  );

  const bw = barWidthPx(groups.length, compact);

  // Per-group step-to-step conversions (for tooltip "from prev" value)
  const groupConvs = new Map<string, (number | null)[]>();
  for (const gv of groups) {
    groupConvs.set(
      gv,
      stepNums.map((sn, i) => {
        if (i === 0) return null;
        const prev = stepMap.get(stepNums[i - 1])?.get(gv);
        const curr = stepMap.get(sn)?.get(gv);
        if (!prev || !curr) return null;
        return prev.count > 0 ? Math.round((curr.count / prev.count) * 1000) / 10 : 0;
      }),
    );
  }

  return (
    <div className="flex flex-col gap-0 select-none">
      {/* Color legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-5">
        {groups.map((bv, idx) => {
          const color = SERIES_COLORS[idx % SERIES_COLORS.length];
          const count = step1Map.get(bv)?.count ?? 0;
          return (
            <div key={bv} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-[12px] font-medium text-foreground">{bv}</span>
              <span className="text-[11px] text-muted-foreground">({count.toLocaleString()})</span>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="flex items-start gap-0">
        <YAxis h={barH} />

        {stepNums.map((sn, si) => {
          const byGroup = stepMap.get(sn)!;
          const agg = aggregateSteps[si];
          const isFirst = si === 0;

          return (
            <div key={sn} className="flex flex-col shrink-0">
              {/* Bars */}
              <div
                className={`relative px-2 ${!isFirst ? 'border-l border-dashed border-border/35' : ''}`}
                style={{ height: barH }}
              >
                <GridLines h={barH} />
                <div className="absolute inset-x-0 bottom-0 border-t border-border/50 pointer-events-none" />

                <div className="relative z-10 flex items-end gap-0.5 h-full">
                  {groups.map((bv, gi) => {
                    const gs = byGroup.get(bv);
                    const isHov = hovered?.si === si && hovered?.gi === gi;
                    const color = SERIES_COLORS[gi % SERIES_COLORS.length];

                    return (
                      <div
                        key={bv}
                        className="relative flex items-end cursor-default"
                        style={{ height: barH }}
                        onMouseEnter={() => setHovered({ si, gi })}
                        onMouseLeave={() => setHovered(null)}
                      >
                        {isHov && gs && (
                          <BarTooltip step={gs} stepConv={groupConvs.get(bv)?.[si] ?? null} title={bv} />
                        )}
                        <Bar
                          color={color}
                          conversionRate={gs?.conversion_rate ?? 0}
                          width={bw}
                          height={barH}
                          hovered={isHov}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend — uses backend-computed aggregate totals */}
              <div className={`px-2 ${!isFirst ? 'border-l border-border/25' : ''}`}>
                <StepLegend
                  stepNum={sn}
                  label={agg?.label ?? ''}
                  eventName={agg?.event_name ?? ''}
                  count={agg?.count ?? 0}
                  conversionRate={agg?.conversion_rate ?? 0}
                  dropOff={agg?.drop_off ?? 0}
                  dropOffRate={agg?.drop_off_rate ?? 0}
                  isFirst={isFirst}
                  isLast={si === stepNums.length - 1}
                  compact={compact}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export function FunnelChart({ steps, breakdown, aggregateSteps, compact = false }: FunnelChartProps) {
  if (steps.length === 0) return null;
  if (!breakdown) return <PlainFunnel steps={steps} compact={compact} />;

  // Backend provides aggregate_steps; fall back to computing from steps for old cache entries
  const agg: FunnelStepResult[] = aggregateSteps ?? (() => {
    const totals = new Map<number, number>();
    for (const s of steps) totals.set(s.step, (totals.get(s.step) ?? 0) + s.count);
    const nums = [...totals.keys()].sort((a, b) => a - b);
    const base = totals.get(nums[0]) ?? 0;
    return nums.map((sn, i) => {
      const total = totals.get(sn) ?? 0;
      const prev = i > 0 ? (totals.get(nums[i - 1]) ?? total) : total;
      const isFirst = i === 0;
      const dropOff = isFirst ? 0 : prev - total;
      return {
        step: sn,
        label: steps.find((s) => s.step === sn)?.label ?? '',
        event_name: steps.find((s) => s.step === sn)?.event_name ?? '',
        count: total,
        conversion_rate: base > 0 ? Math.round((total / base) * 1000) / 10 : 0,
        drop_off: dropOff,
        drop_off_rate: prev > 0 && !isFirst ? Math.round((dropOff / prev) * 1000) / 10 : 0,
        avg_time_to_convert_seconds: null,
      };
    });
  })();

  return <BreakdownFunnel steps={steps} aggregateSteps={agg} compact={compact} />;
}
