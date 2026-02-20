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

interface RetentionChartProps {
  result: RetentionResult;
  compact?: boolean;
}

export function RetentionChart({ result, compact = false }: RetentionChartProps) {
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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="period"
          tick={{ fill: '#a1a1aa', fontSize: compact ? 10 : 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#a1a1aa', fontSize: compact ? 10 : 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={compact ? 35 : 45}
        />
        {!compact && (
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value: number) => [`${value}%`, 'Retention']}
          />
        )}
        <Line
          type="monotone"
          dataKey="retention"
          stroke="#22c55e"
          strokeWidth={2}
          dot={!compact}
          activeDot={compact ? false : { r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
