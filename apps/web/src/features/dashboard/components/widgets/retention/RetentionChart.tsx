import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { RetentionResult } from '@/api/generated/Api';
import { CHART_COLORS_HEX, CHART_TOOLTIP_STYLE, CHART_AXIS_TICK_COLOR, CHART_GRID_COLOR } from '@/lib/chart-colors';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './RetentionChart.translations';

interface RetentionChartProps {
  result: RetentionResult;
  compact?: boolean;
}

export function RetentionChart({ result, compact = false }: RetentionChartProps) {
  const { t } = useLocalTranslation(translations);
  const { average_retention, granularity } = result;

  const data = useMemo(
    () =>
      average_retention.map((pct, i) => ({
        period: `${granularity === 'day' ? 'D' : granularity === 'week' ? 'W' : 'M'}${i}`,
        retention: Math.round(pct * 100) / 100,
      })),
    [average_retention, granularity],
  );

  if (data.length === 0) return null;

  const height = compact ? 160 : 300;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={compact ? { top: 5, right: 10, bottom: 5, left: 0 } : { top: 10, right: 30, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} opacity={0.5} />
        <XAxis
          dataKey="period"
          tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: compact ? 10 : 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: compact ? 10 : 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={compact ? 40 : 45}
        />
        {!compact && (
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`${value}%`, t('retention')]}
          />
        )}
        <Line
          type="monotone"
          dataKey="retention"
          stroke={CHART_COLORS_HEX[1]}
          strokeWidth={2}
          dot={!compact}
          activeDot={compact ? false : { r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
