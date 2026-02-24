import { PlainFunnel } from './PlainFunnel';
import { BreakdownFunnel } from './BreakdownFunnel';
import type { FunnelStepResult } from '@/api/generated/Api';

export interface FunnelChartProps {
  steps: FunnelStepResult[];
  breakdown?: boolean;
  aggregateSteps?: FunnelStepResult[];
  compact?: boolean;
  conversionRateDisplay?: 'total' | 'relative';
}

export function FunnelChart({ steps, breakdown, aggregateSteps, compact = false, conversionRateDisplay = 'total' }: FunnelChartProps) {
  const relative = conversionRateDisplay === 'relative';
  if (steps.length === 0) return null;
  if (!breakdown) return <PlainFunnel steps={steps} compact={compact} relative={relative} />;

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

  return <BreakdownFunnel steps={steps} aggregateSteps={agg} compact={compact} relative={relative} />;
}
