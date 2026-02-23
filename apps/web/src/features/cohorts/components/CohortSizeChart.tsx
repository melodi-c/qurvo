import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { CohortHistoryPoint } from '@/api/generated/Api';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './CohortSizeChart.translations';

interface CohortSizeChartProps {
  data: CohortHistoryPoint[];
}

export function CohortSizeChart({ data }: CohortSizeChartProps) {
  const { t, lang } = useLocalTranslation(translations);

  const chartData = useMemo(
    () =>
      data.map((p) => ({
        date: p.date,
        count: p.count,
        label: new Date(p.date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
          day: '2-digit',
          month: 'short',
        }),
      })),
    [data, lang],
  );

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
        {t('noData')}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
        <defs>
          <linearGradient id="cohortSizeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={45}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          formatter={(value: number) => [value.toLocaleString(), t('members')]}
          labelFormatter={(label: string) => label}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="hsl(221, 83%, 53%)"
          strokeWidth={2}
          fill="url(#cohortSizeFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
