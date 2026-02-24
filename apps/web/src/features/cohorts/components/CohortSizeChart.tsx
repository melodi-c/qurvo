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
import { CHART_COLORS_HSL } from '@/lib/chart-colors';
import type { CohortHistoryPoint } from '@/api/generated/Api';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './CohortSizeChart.translations';

const SERIES_COLOR = CHART_COLORS_HSL[0]; // blue

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
            <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.3} />
            <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={45}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          formatter={(value: number) => [value.toLocaleString(), t('members')]}
          labelFormatter={(label: string) => label}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={SERIES_COLOR}
          strokeWidth={2}
          fill="url(#cohortSizeFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
