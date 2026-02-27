import type { FunnelResult } from '@/api/generated/Api';

export function getFunnelMetrics(data?: FunnelResult) {
  const agg = data?.aggregate_steps ?? data?.steps;
  const first = agg?.[0];
  const last = agg?.at(-1);
  return {
    overallConversion:
      first && last && first.count > 0
        ? Math.round((last.count / first.count) * 1000) / 10
        : null,
    totalEntered: first?.count ?? null,
    totalConverted: last?.count ?? null,
  };
}
