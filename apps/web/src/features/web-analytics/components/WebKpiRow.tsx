import type { WebAnalyticsKPIs } from '@/api/generated/Api';
import { WebKpiCard } from './WebKpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './WebKpiRow.translations';

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
  isError?: boolean;
  onRetry?: () => void;
}

export function WebKpiRow({ current, previous, isLoading, isError, onRetry }: WebKpiRowProps) {
  const { t } = useLocalTranslation(translations);

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-6 flex flex-col items-center gap-3 text-sm text-destructive/80">
        <span>{t('loadError')}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        )}
      </div>
    );
  }

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
        label={t('uniqueVisitors')}
        value={formatNumber(current.unique_visitors)}
        currentValue={current.unique_visitors}
        previousValue={previous.unique_visitors}
      />
      <WebKpiCard
        label={t('pageviews')}
        value={formatNumber(current.pageviews)}
        currentValue={current.pageviews}
        previousValue={previous.pageviews}
      />
      <WebKpiCard
        label={t('sessions')}
        value={formatNumber(current.sessions)}
        currentValue={current.sessions}
        previousValue={previous.sessions}
      />
      <WebKpiCard
        label={t('avgDuration')}
        value={formatDuration(current.avg_duration_seconds)}
        currentValue={current.avg_duration_seconds}
        previousValue={previous.avg_duration_seconds}
      />
      <WebKpiCard
        label={t('bounceRate')}
        value={formatPercent(current.bounce_rate)}
        currentValue={current.bounce_rate}
        previousValue={previous.bounce_rate}
        invertSentiment
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
