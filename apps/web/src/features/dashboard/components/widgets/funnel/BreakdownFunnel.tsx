import { useState } from 'react';
import { YAxis, GridLines, Bar } from './FunnelBar';
import { BarTooltip } from './FunnelTooltip';
import { StepLegend } from './FunnelStepLegend';
import { SERIES_COLORS, BAR_AREA_H_FULL, BAR_AREA_H_COMPACT, barWidthPx } from './funnel-chart-utils';
import type { FunnelStepResult } from '@/api/generated/Api';

export function BreakdownFunnel({
  steps,
  aggregateSteps,
  compact,
  relative,
}: {
  steps: FunnelStepResult[];
  aggregateSteps: FunnelStepResult[];
  compact: boolean;
  relative: boolean;
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
                          conversionRate={relative
                            ? (si === 0 ? 100 : (groupConvs.get(bv)?.[si] ?? 0))
                            : (gs?.conversion_rate ?? 0)}
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
