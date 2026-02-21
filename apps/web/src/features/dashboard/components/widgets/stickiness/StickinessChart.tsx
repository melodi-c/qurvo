import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { StickinessResult } from '@/api/generated/Api';

interface StickinessChartProps {
  result: StickinessResult;
  compact?: boolean;
}

const GRANULARITY_LABELS: Record<string, string> = {
  day: 'days',
  week: 'weeks',
  month: 'months',
};

export function StickinessChart({ result, compact = false }: StickinessChartProps) {
  const totalUsers = useMemo(
    () => result.data.reduce((sum, d) => sum + d.user_count, 0),
    [result.data],
  );

  const data = useMemo(
    () =>
      result.data.map((d) => ({
        label: `${d.period_count} ${GRANULARITY_LABELS[result.granularity] ?? 'periods'}`,
        period_count: d.period_count,
        user_count: d.user_count,
        pct: totalUsers > 0 ? Math.round((d.user_count / totalUsers) * 1000) / 10 : 0,
      })),
    [result.data, result.granularity, totalUsers],
  );

  if (data.length === 0) return null;

  const height = compact ? 160 : 300;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={compact ? { top: 5, right: 10, bottom: 5, left: 0 } : { top: 10, right: 30, bottom: 10, left: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#a1a1aa', fontSize: compact ? 10 : 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#a1a1aa', fontSize: compact ? 10 : 12 }}
          axisLine={false}
          tickLine={false}
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
            formatter={(value: number, _name: string, entry: any) => [
              `${value} users (${entry.payload.pct}%)`,
              'Users',
            ]}
          />
        )}
        <Bar dataKey="user_count" fill="#f59e0b" name="Users" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
