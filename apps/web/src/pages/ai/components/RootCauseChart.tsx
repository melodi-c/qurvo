import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { StatRow } from '@/components/ui/stat-row';
import { CHART_TOOLTIP_STYLE, CHART_GRID_COLOR, STATUS_COLORS_HEX, chartAxisTick } from '@/lib/chart-colors';
import { formatCompactNumber } from '@/lib/formatting';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import type { RootCauseResult } from '../ai-tool-result-export';
import translations from '../ai-tool-result.translations';

interface RootCauseChartProps {
  data: RootCauseResult;
}

export function RootCauseChart({ data }: RootCauseChartProps) {
  const { t } = useLocalTranslation(translations);
  const { top_segments, overall } = data;

  const isPositiveOverall = overall.relative_change_pct >= 0;

  const chartData = top_segments.map((s) => ({
    name: `${s.dimension}: ${s.segment_value}`,
    contribution: s.contribution_pct,
    relativeChange: s.relative_change_pct,
  }));

  const barHeight = 28;
  const minHeight = 160;
  const height = Math.max(minHeight, chartData.length * barHeight + 80);

  const overallColorClass = isPositiveOverall ? 'text-emerald-400' : 'text-red-400';
  const overallSign = isPositiveOverall ? '+' : '';

  return (
    <div>
      <StatRow
        className="mb-3"
        items={[
          {
            label: t('overall'),
            value: `${overallSign}${overall.relative_change_pct.toFixed(1)}%`,
            valueClassName: overallColorClass,
          },
          {
            label: overall.metric,
            value: `${overallSign}${formatCompactNumber(overall.absolute_change)}`,
          },
        ]}
      />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
          barCategoryGap="30%"
        >
          <XAxis
            type="number"
            tick={chartAxisTick()}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={chartAxisTick()}
            axisLine={false}
            tickLine={false}
            width={160}
          />
          <RechartsTooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)}%`,
              name === 'contribution' ? t('contribution') : t('relativeChange'),
            ]}
          />
          <ReferenceLine x={0} stroke={CHART_GRID_COLOR} />
          <Bar dataKey="contribution" name={t('contribution')} radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.contribution >= 0 ? STATUS_COLORS_HEX.positive : STATUS_COLORS_HEX.negative}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
