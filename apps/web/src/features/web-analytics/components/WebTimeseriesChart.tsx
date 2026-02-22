import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { WebAnalyticsTimeseriesPoint } from '@/api/generated/Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './WebTimeseriesChart.translations';

type MetricKey = 'unique_visitors' | 'pageviews' | 'sessions';

const METRIC_COLORS: Record<MetricKey, string> = {
  unique_visitors: '#818cf8',
  pageviews: '#34d399',
  sessions: '#fbbf24',
};

function formatBucket(bucket: string, granularity: string): string {
  const d = new Date(bucket);
  if (granularity === 'hour') {
    return d.toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric' });
  }
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

interface WebTimeseriesChartProps {
  data?: WebAnalyticsTimeseriesPoint[];
  granularity?: string;
  isLoading: boolean;
  metric: MetricKey;
  onMetricChange: (metric: MetricKey) => void;
}

export function WebTimeseriesChart({
  data,
  granularity = 'day',
  isLoading,
  metric,
  onMetricChange,
}: WebTimeseriesChartProps) {
  const { t } = useLocalTranslation(translations);

  const metricOptions: { label: string; value: MetricKey }[] = useMemo(() => [
    { label: t('visitors'), value: 'unique_visitors' },
    { label: t('pageviews'), value: 'pageviews' },
    { label: t('sessions'), value: 'sessions' },
  ], [t]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      ...d,
      label: formatBucket(d.bucket, granularity),
    }));
  }, [data, granularity]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{t('trafficOverTime')}</CardTitle>
        <PillToggleGroup
          options={metricOptions}
          value={metric}
          onChange={onMetricChange}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#a1a1aa' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#a1a1aa' }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#a1a1aa' }}
              />
              <Line
                type="monotone"
                dataKey={metric}
                stroke={METRIC_COLORS[metric]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export type { MetricKey };
