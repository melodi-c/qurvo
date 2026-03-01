import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { StatRow } from '@/components/ui/stat-row';
import { CHART_COLORS_HEX, CHART_TOOLTIP_STYLE, CHART_GRID_COLOR, chartAxisTick } from '@/lib/chart-colors';
import { formatCompactNumber } from '@/lib/formatting';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import type { SegmentCompareResult } from '../ai-tool-result-export';
import translations from '../ai-tool-result.translations';

interface SegmentCompareChartProps {
  data: SegmentCompareResult;
}

export function SegmentCompareChart({ data }: SegmentCompareChartProps) {
  const { t } = useLocalTranslation(translations);
  const { segment_a, segment_b, comparison } = data;

  const chartData = [
    { name: segment_a.name, value: segment_a.value, colorIndex: 0 },
    { name: segment_b.name, value: segment_b.value, colorIndex: 1 },
  ];

  const isPositiveDiff = comparison.absolute_diff >= 0;
  const diffLabel = isPositiveDiff
    ? `+${formatCompactNumber(comparison.absolute_diff)}`
    : formatCompactNumber(comparison.absolute_diff);
  const diffPctLabel = isPositiveDiff
    ? `+${comparison.relative_diff_pct.toFixed(1)}%`
    : `${comparison.relative_diff_pct.toFixed(1)}%`;

  const diffColorClass = isPositiveDiff ? 'text-emerald-400' : 'text-red-400';

  return (
    <div>
      <StatRow
        className="mb-3"
        items={[
          { label: t('winner'), value: comparison.winner },
          { label: t('absoluteDiff'), value: diffLabel, valueClassName: diffColorClass },
          { label: t('relativeDiff'), value: diffPctLabel, valueClassName: diffColorClass },
        ]}
      />
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} barCategoryGap="30%">
          <XAxis
            dataKey="name"
            tick={chartAxisTick()}
            axisLine={{ stroke: CHART_GRID_COLOR }}
            tickLine={false}
          />
          <YAxis
            tick={chartAxisTick()}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatCompactNumber}
            width={48}
          />
          <RechartsTooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(value: number) => [formatCompactNumber(value), data.metric]}
          />
          <ReferenceLine y={0} stroke={CHART_GRID_COLOR} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.name}
                fill={CHART_COLORS_HEX[entry.colorIndex] ?? CHART_COLORS_HEX[0]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: CHART_COLORS_HEX[0] }}
          />
          <span>{segment_a.name}: {formatCompactNumber(segment_a.value)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: CHART_COLORS_HEX[1] }}
          />
          <span>{segment_b.name}: {formatCompactNumber(segment_b.value)}</span>
        </div>
      </div>
    </div>
  );
}
