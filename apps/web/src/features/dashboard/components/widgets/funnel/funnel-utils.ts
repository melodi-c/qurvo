import type { FunnelResult } from '@/api/generated/Api';

export function getFunnelMetrics(data?: FunnelResult) {
  const agg = data?.aggregate_steps ?? data?.steps;
  return {
    overallConversion: agg?.at(-1)?.conversion_rate ?? null,
    totalEntered: agg?.[0]?.count ?? null,
    totalConverted: agg?.at(-1)?.count ?? null,
  };
}
