import { useState } from 'react';
import { YAxis, GridLines, Bar } from './FunnelBar';
import { BarTooltip } from './FunnelTooltip';
import { StepLegend } from './FunnelStepLegend';
import { SERIES_COLORS, BAR_AREA_H_FULL, BAR_AREA_H_COMPACT, barWidthPx } from './funnel-chart-utils';
import type { FunnelStepResult } from '@/api/generated/Api';

export function PlainFunnel({ steps, compact, relative }: { steps: FunnelStepResult[]; compact: boolean; relative: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const color = SERIES_COLORS[0];
  const barH = compact ? BAR_AREA_H_COMPACT : BAR_AREA_H_FULL;
  const bw = barWidthPx(1, compact);

  const stepConvs = steps.map((s, i) => {
    if (i === 0) return null;
    const prev = steps[i - 1];
    return prev.count > 0 ? Math.round((s.count / prev.count) * 1000) / 10 : 0;
  });

  const barRates = relative
    ? steps.map((_, i) => (i === 0 ? 100 : (stepConvs[i] ?? 0)))
    : steps.map((s) => s.conversion_rate);

  return (
    <div className="overflow-x-auto">
    <div className="flex items-start gap-0 select-none min-w-max">
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
                <Bar color={color} conversionRate={barRates[i]} width={bw} height={barH} hovered={isHov} />
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
    </div>
  );
}
