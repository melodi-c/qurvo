import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS_HEX, CHART_TOOLTIP_STYLE, chartAxisTick } from '@/lib/chart-colors';
import { formatCompactNumber, formatSeconds } from '@/lib/formatting';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import type { TimeBetweenEventsResult } from '../ai-tool-result-export';
import translations from '../ai-tool-result.translations';

function formatStatDuration(seconds: number): string {
  return formatSeconds(seconds) ?? '0';
}

interface HistogramChartProps {
  data: TimeBetweenEventsResult;
}

export function HistogramChart({ data }: HistogramChartProps) {
  const { t } = useLocalTranslation(translations);
  const { stats, buckets, total_users } = data;

  if (buckets.length === 0 || total_users === 0) {
    return <p className="text-sm text-muted-foreground">{t('noData')}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground">{t('totalUsers')}:</span> {total_users}</span>
        <span><span className="font-medium text-foreground">{t('median')}:</span> {formatStatDuration(stats.median_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('p75')}:</span> {formatStatDuration(stats.p75_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('p90')}:</span> {formatStatDuration(stats.p90_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('avg')}:</span> {formatStatDuration(stats.mean_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('min')}:</span> {formatStatDuration(stats.min_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('max')}:</span> {formatStatDuration(stats.max_seconds)}</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={buckets}
          margin={{ top: 4, right: 10, bottom: 24, left: 10 }}
        >
          <XAxis
            dataKey="label"
            tick={chartAxisTick()}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={48}
          />
          <YAxis
            tick={chartAxisTick()}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatCompactNumber}
            width={44}
          />
          <RechartsTooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(value: number) => [value, t('users')]}
          />
          <Bar dataKey="count" fill={CHART_COLORS_HEX[0]} radius={[4, 4, 0, 0]} name={t('users')} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
