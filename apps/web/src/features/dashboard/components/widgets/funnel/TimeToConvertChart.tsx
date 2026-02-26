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
import type { TimeToConvertBin } from '@/api/generated/Api';
import { CHART_COLORS_HEX, CHART_TOOLTIP_STYLE, CHART_AXIS_TICK_COLOR, CHART_GRID_COLOR } from '@/lib/chart-colors';
import { formatSeconds } from '@/lib/formatting';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TimeToConvertChart.translations';

interface TimeToConvertChartProps {
  bins: TimeToConvertBin[];
}

export function TimeToConvertChart({ bins }: TimeToConvertChartProps) {
  const { t } = useLocalTranslation(translations);

  const data = useMemo(
    () =>
      bins.map((bin) => ({
        label: `${formatSeconds(bin.from_seconds) ?? ''}\u2013${formatSeconds(bin.to_seconds) ?? ''}`,
        count: bin.count,
      })),
    [bins],
  );

  if (data.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
      />
    );
  }

  const usersLabel = t('users');

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 10, right: 30, bottom: 10, left: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} opacity={0.5} />
        <XAxis
          dataKey="label"
          tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_AXIS_TICK_COLOR, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={45}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number) => [value, usersLabel]}
        />
        <Bar
          dataKey="count"
          fill={CHART_COLORS_HEX[0]}
          name={usersLabel}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
