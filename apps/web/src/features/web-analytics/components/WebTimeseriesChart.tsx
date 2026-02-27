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
import { useProjectStore } from '@/stores/project';
import { WEB_METRIC_COLORS, CHART_TOOLTIP_STYLE, CHART_AXIS_TICK_COLOR, CHART_GRID_COLOR } from '@/lib/chart-colors';
import { formatBucket } from '@/lib/formatting';
import translations from './WebTimeseriesChart.translations';

type MetricKey = 'unique_visitors' | 'pageviews' | 'sessions';

const METRIC_COLORS = WEB_METRIC_COLORS;

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
  const timezone = useProjectStore((s) => s.projectTimezone);

  const metricOptions: { label: string; value: MetricKey }[] = useMemo(() => [
    { label: t('visitors'), value: 'unique_visitors' },
    { label: t('pageviews'), value: 'pageviews' },
    { label: t('sessions'), value: 'sessions' },
  ], [t]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      ...d,
      label: formatBucket(d.bucket, granularity, false, timezone),
    }));
  }, [data, granularity, timezone]);

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
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} opacity={0.5} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: CHART_AXIS_TICK_COLOR }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_AXIS_TICK_COLOR }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: CHART_AXIS_TICK_COLOR }}
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
