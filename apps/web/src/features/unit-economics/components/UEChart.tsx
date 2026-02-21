import { useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { UEBucket } from '@/api/generated/Api';

const METRIC_COLORS: Record<string, string> = {
  ua: '#60a5fa',
  c1: '#34d399',
  c2: '#a78bfa',
  arpu: '#fbbf24',
  ltv: '#f472b6',
  cac: '#f87171',
  roi_percent: '#2dd4bf',
};

const METRIC_LABELS: Record<string, string> = {
  ua: 'UA',
  c1: 'C1',
  c2: 'C2',
  apc: 'APC',
  avp: 'AVP',
  arppu: 'ARPPU',
  arpu: 'ARPU',
  churn_rate: 'Churn',
  lifetime_periods: 'Lifetime',
  ltv: 'LTV',
  cac: 'CAC',
  roi_percent: 'ROI %',
  cm: 'CM',
};

interface UEChartProps {
  buckets: UEBucket[];
  selectedMetrics: string[];
}

export function UEChart({ buckets, selectedMetrics }: UEChartProps) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        bucket: b.bucket.slice(0, 10),
        ...b.metrics,
      })),
    [buckets],
  );

  const formatValue = useCallback((value: number, metric: string) => {
    if (metric === 'c1' || metric === 'c2' || metric === 'churn_rate') {
      return (value * 100).toFixed(1) + '%';
    }
    if (metric === 'roi_percent') return value.toFixed(1) + '%';
    return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }, []);

  if (data.length === 0) return null;

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#a1a1aa' }} />
          <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
            labelStyle={{ color: '#a1a1aa' }}
            formatter={(value: number, name: string) => [formatValue(value, name), METRIC_LABELS[name] ?? name]}
          />
          <Legend formatter={(value: string) => METRIC_LABELS[value] ?? value} />
          {selectedMetrics.map((metric) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke={METRIC_COLORS[metric] ?? '#a1a1aa'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
