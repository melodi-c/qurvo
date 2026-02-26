export type Metric = 'unique_users' | 'total_events' | 'events_per_user';

export function computeMetricValue(metric: Metric, raw: number, uniq: number): number {
  if (metric === 'unique_users') return uniq;
  if (metric === 'total_events') return raw;
  // events_per_user
  return uniq > 0 ? Math.round((raw / uniq) * 100) / 100 : 0;
}
