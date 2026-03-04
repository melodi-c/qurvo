import { useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import type { TrendSeriesResult } from '@/api/generated/Api';
import { CHART_COLORS_HSL, CHART_TOOLTIP_STYLE } from '@/lib/chart-colors';
import { formatCompactNumber } from '@/lib/formatting';
import { seriesKey } from './trend-utils';
import { TruncatedText } from './TruncatedText';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendPieChart.translations';

const COLORS = CHART_COLORS_HSL;
const MAX_SECTORS = 10;

interface TrendPieChartProps {
  series: TrendSeriesResult[];
  compact?: boolean;
}

interface PieSlice {
  name: string;
  value: number;
  colorIndex: number;
}

/**
 * Custom tooltip for the pie chart.
 * Shows name, value, and percentage.
 */
function PieTooltipContent({
  active,
  payload,
  total,
  t,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  total: number;
  t: (key: string) => string;
}) {
  if (!active || !payload?.length) {return null;}
  const entry = payload[0];
  const value = entry.value as number;
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';

  return (
    <div style={CHART_TOOLTIP_STYLE} className="px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-foreground mb-1">{entry.name}</p>
      <p className="text-xs text-muted-foreground">
        {t('value')}: {formatCompactNumber(value)} ({pct}% {t('percent')})
      </p>
    </div>
  );
}

/**
 * Legend for the pie chart — shows color dot, name, value, and percent.
 */
function PieLegend({
  slices,
  total,
  compact,
}: {
  slices: PieSlice[];
  total: number;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-1">
        {slices.map((slice) => (
          <div key={slice.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[slice.colorIndex % COLORS.length] }}
            />
            <TruncatedText text={slice.name} className="truncate max-w-[80px]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-1.5 px-2">
      {slices.map((slice) => {
        const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
        return (
          <div key={slice.name} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[slice.colorIndex % COLORS.length] }}
            />
            <TruncatedText text={slice.name} className="text-foreground truncate flex-1" />
            <span className="text-muted-foreground tabular-nums">
              {formatCompactNumber(slice.value)}
            </span>
            <span className="text-muted-foreground tabular-nums w-12 text-right">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TrendPieChart({ series, compact }: TrendPieChartProps) {
  const { t } = useLocalTranslation(translations);

  const { slices, total } = useMemo(() => {
    // Aggregate each series total
    const raw: PieSlice[] = series.map((s, idx) => ({
      name: seriesKey(s),
      value: s.data.reduce((acc, dp) => acc + dp.value, 0),
      colorIndex: idx,
    }));

    // Sort by value descending
    raw.sort((a, b) => b.value - a.value);

    // Limit to top MAX_SECTORS, group remainder into "Other"
    let result: PieSlice[];
    if (raw.length > MAX_SECTORS) {
      const top = raw.slice(0, MAX_SECTORS);
      const otherValue = raw.slice(MAX_SECTORS).reduce((acc, s) => acc + s.value, 0);
      result = [
        ...top,
        { name: t('other'), value: otherValue, colorIndex: MAX_SECTORS },
      ];
    } else {
      result = raw;
    }

    const totalValue = result.reduce((acc, s) => acc + s.value, 0);
    return { slices: result, total: totalValue };
  }, [series, t]);

  const renderTooltip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => <PieTooltipContent {...props} total={total} t={t} />,
    [total, t],
  );

  if (slices.length === 0) {return null;}

  const chartHeight = compact ? '100%' : 300;
  const outerRadius = compact ? '80%' : '75%';
  const innerRadius = compact ? '45%' : '50%';

  return (
    <div className={compact ? 'h-full flex flex-col' : ''}>
      <div style={{ height: chartHeight }} className={compact ? 'flex-1 min-h-0' : ''}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={outerRadius}
              innerRadius={innerRadius}
              paddingAngle={1}
              strokeWidth={0}
            >
              {slices.map((slice) => (
                <Cell
                  key={slice.name}
                  fill={COLORS[slice.colorIndex % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={renderTooltip} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <PieLegend slices={slices} total={total} compact={compact} />
    </div>
  );
}
