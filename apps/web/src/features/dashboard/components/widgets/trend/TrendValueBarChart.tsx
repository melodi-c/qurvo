import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import type { TrendSeriesResult } from '@/api/generated/Api';
import {
  CHART_COLORS_HSL,
  CHART_TOOLTIP_STYLE,
  CHART_AXIS_TICK_COLOR,
  chartAxisTick,
} from '@/lib/chart-colors';
import type { SVGProps } from 'react';
import { formatCompactNumber } from '@/lib/formatting';
import { seriesKey } from './trend-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendValueBarChart.translations';

const COLORS = CHART_COLORS_HSL;
const MAX_BARS = 20;

export interface TrendValueBarChartProps {
  series: TrendSeriesResult[];
  compact?: boolean;
}

interface BarDatum {
  name: string;
  value: number;
  colorIdx: number;
}

/**
 * Custom YAxis tick that truncates long names and adds a native SVG <title> tooltip.
 */
function TruncatedYAxisTick({
  x,
  y,
  payload,
  compact,
}: SVGProps<SVGTextElement> & { payload?: { value: string }; compact?: boolean }) {
  const text = payload?.value ?? '';
  const fontSize = compact ? 10 : 12;
  const maxChars = compact ? 10 : 18;
  const display = text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-4}
        y={0}
        dy={4}
        textAnchor="end"
        fill={CHART_AXIS_TICK_COLOR}
        fontSize={fontSize}
      >
        {display}
        <title>{text}</title>
      </text>
    </g>
  );
}

export function TrendValueBarChart({ series, compact }: TrendValueBarChartProps) {
  const { t } = useLocalTranslation(translations);

  const barData = useMemo(() => {
    const items: BarDatum[] = series.map((s, idx) => ({
      name: seriesKey(s),
      value: s.data.reduce((acc, dp) => acc + dp.value, 0),
      colorIdx: idx,
    }));

    items.sort((a, b) => b.value - a.value);

    return items;
  }, [series]);

  if (barData.length === 0) {
    return null;
  }

  const displayData = barData.slice(0, MAX_BARS);
  const truncated = barData.length > MAX_BARS;

  const tickStyle = chartAxisTick(compact);
  const barHeight = compact ? 24 : 32;
  const chartHeight = compact
    ? '100%'
    : Math.max(200, displayData.length * barHeight + 40);
  const margin = compact
    ? { top: 4, right: 40, left: 4, bottom: truncated ? 20 : 4 }
    : { top: 8, right: 48, left: 8, bottom: truncated ? 24 : 8 };

  return (
    <div className={compact ? 'h-full' : ''}>
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={displayData}
            layout="vertical"
            margin={margin}
            barCategoryGap={compact ? 4 : 8}
          >
            <XAxis
              type="number"
              tick={tickStyle}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCompactNumber}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={<TruncatedYAxisTick compact={compact} />}
              tickLine={false}
              axisLine={false}
              width={compact ? 80 : 140}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value: number) => [
                value.toLocaleString(),
                t('value'),
              ]}
              cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={compact ? 20 : 28}>
              {displayData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={COLORS[entry.colorIdx % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Truncation notice */}
      {truncated && (
        compact ? (
          <div className="text-center text-[10px] text-muted-foreground py-0.5">
            +{barData.length - MAX_BARS}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center mt-1">
            {t('otherItems', { count: String(barData.length - MAX_BARS) })}
          </p>
        )
      )}
    </div>
  );
}
