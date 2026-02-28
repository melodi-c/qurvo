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
import { BarChart3 } from 'lucide-react';
import type { StickinessResult } from '@/api/generated/Api';
import { CHART_COLORS_HEX, CHART_TOOLTIP_STYLE, CHART_AXIS_TICK_COLOR, CHART_GRID_COLOR } from '@/lib/chart-colors';
import { formatCompactNumber, formatGranularity } from '@/lib/formatting';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './StickinessChart.translations';

interface StickinessChartProps {
  result: StickinessResult;
  compact?: boolean;
}

export function StickinessChart({ result, compact = false }: StickinessChartProps) {
  const { t } = useLocalTranslation(translations);

  const totalUsers = useMemo(
    () => result.data.reduce((sum, d) => sum + d.user_count, 0),
    [result.data],
  );

  const data = useMemo(
    () =>
      result.data.map((d) => ({
        label: `${d.period_count} ${formatGranularity(d.period_count, result.granularity)}`,
        period_count: d.period_count,
        user_count: d.user_count,
        pct: totalUsers > 0 ? Math.round((d.user_count / totalUsers) * 1000) / 10 : 0,
      })),
    [result.data, result.granularity, totalUsers],
  );

  if (data.length === 0) {
    return <EmptyState icon={BarChart3} description={t('noData')} />;
  }

  const usersLabel = t('users');

  return (
    <div className={compact ? 'h-full' : ''}>
    <ResponsiveContainer width="100%" height={compact ? '100%' : 300}>
      <BarChart
        data={data}
        margin={compact ? { top: 5, right: 10, bottom: 5, left: 0 } : { top: 10, right: 30, bottom: 10, left: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} opacity={0.5} />
        <XAxis
          dataKey="label"
          tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: compact ? 10 : 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: compact ? 10 : 12 }}
          axisLine={false}
          tickLine={false}
          width={compact ? 40 : 45}
          tickFormatter={compact ? formatCompactNumber : undefined}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number, _name: string, entry: { payload?: { pct: number } }) => [
            `${value.toLocaleString()} ${usersLabel.toLowerCase()} (${entry.payload?.pct ?? 0}%)`,
            usersLabel,
          ]}
        />
        <Bar dataKey="user_count" fill={CHART_COLORS_HEX[2]} name={usersLabel} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
