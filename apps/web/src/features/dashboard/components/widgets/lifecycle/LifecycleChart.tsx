import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { LifecycleResult } from '@/api/generated/Api';
import { LIFECYCLE_STATUS_COLORS } from './lifecycle-shared';

interface LifecycleChartProps {
  result: LifecycleResult;
  compact?: boolean;
}

export function LifecycleChart({ result, compact = false }: LifecycleChartProps) {
  const data = useMemo(
    () =>
      result.data.map((d) => ({
        bucket: d.bucket.slice(0, 10),
        new: d.new,
        returning: d.returning,
        resurrecting: d.resurrecting,
        dormant: d.dormant,
      })),
    [result.data],
  );

  if (data.length === 0) return null;

  const height = compact ? 160 : 300;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        stackOffset="sign"
        margin={compact ? { top: 5, right: 10, bottom: 5, left: 0 } : { top: 10, right: 30, bottom: 10, left: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="bucket"
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
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
        {!compact && (
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
        )}
        <Bar dataKey="new" stackId="a" fill={LIFECYCLE_STATUS_COLORS.new} name="New" />
        <Bar dataKey="returning" stackId="a" fill={LIFECYCLE_STATUS_COLORS.returning} name="Returning" />
        <Bar dataKey="resurrecting" stackId="a" fill={LIFECYCLE_STATUS_COLORS.resurrecting} name="Resurrecting" />
        <Bar dataKey="dormant" stackId="a" fill={LIFECYCLE_STATUS_COLORS.dormant} name="Dormant" />
      </BarChart>
    </ResponsiveContainer>
  );
}
