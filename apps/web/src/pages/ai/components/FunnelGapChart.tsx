import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { CHART_TOOLTIP_STYLE, CHART_GRID_COLOR, STATUS_COLORS_HEX, chartAxisTick } from '@/lib/chart-colors';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import type { FunnelGapResult } from '../ai-tool-result-export';
import translations from '../ai-tool-result.translations';

interface FunnelGapChartProps {
  data: FunnelGapResult;
}

export function FunnelGapChart({ data }: FunnelGapChartProps) {
  const { t } = useLocalTranslation(translations);
  const { items, funnel_step_from, funnel_step_to } = data;

  const chartData = items.map((item) => ({
    name: item.event_name,
    lift: item.relative_lift_pct,
  }));

  const barHeight = 28;
  const minHeight = 160;
  const height = Math.max(minHeight, chartData.length * barHeight + 80);

  return (
    <div>
      <div className="mb-3 text-sm text-muted-foreground">
        {funnel_step_from} → {funnel_step_to}
      </div>
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
            formatter={(value: number) => [
              `${value.toFixed(1)}%`,
              t('relativeLift'),
            ]}
          />
          <ReferenceLine x={0} stroke={CHART_GRID_COLOR} />
          <Bar dataKey="lift" name={t('relativeLift')} radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.lift >= 0 ? STATUS_COLORS_HEX.positive : STATUS_COLORS_HEX.negative}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
