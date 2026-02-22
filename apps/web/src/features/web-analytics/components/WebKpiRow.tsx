import type { WebAnalyticsKPIs } from '@/api/generated/Api';
import { WebKpiCard } from './WebKpiCard';
import { Skeleton } from '@/components/ui/skeleton';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatPercent(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

interface WebKpiRowProps {
  current?: WebAnalyticsKPIs;
  previous?: WebAnalyticsKPIs;
  isLoading: boolean;
}

export function WebKpiRow({ current, previous, isLoading }: WebKpiRowProps) {
  if (isLoading || !current || !previous) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <WebKpiCard
        label="Unique Visitors"
        value={formatNumber(current.unique_visitors)}
        currentValue={current.unique_visitors}
        previousValue={previous.unique_visitors}
      />
      <WebKpiCard
        label="Pageviews"
        value={formatNumber(current.pageviews)}
        currentValue={current.pageviews}
        previousValue={previous.pageviews}
      />
      <WebKpiCard
        label="Sessions"
        value={formatNumber(current.sessions)}
        currentValue={current.sessions}
        previousValue={previous.sessions}
      />
      <WebKpiCard
        label="Avg Duration"
        value={formatDuration(current.avg_duration_seconds)}
        currentValue={current.avg_duration_seconds}
        previousValue={previous.avg_duration_seconds}
      />
      <WebKpiCard
        label="Bounce Rate"
        value={formatPercent(current.bounce_rate)}
        currentValue={current.bounce_rate}
        previousValue={previous.bounce_rate}
        formatDelta={(cur, prev) => {
          if (prev === 0) return cur > 0 ? '+100%' : '0%';
          const diff = cur - prev;
          const sign = diff >= 0 ? '+' : '';
          return `${sign}${diff.toFixed(1)}pp`;
        }}
      />
    </div>
  );
}
