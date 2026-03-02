import { useMemo } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { TrendSeriesResult } from '@/api/generated/Api';
import { formatCompactNumber } from '@/lib/formatting';
import { CHART_COLORS_HEX, STATUS_COLORS } from '@/lib/chart-colors';
import { seriesKey } from './trend-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TrendNumberViz.translations';

interface TrendNumberVizProps {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  compact?: boolean;
}

/** Compute the percentage delta between current and previous totals. */
function computeDelta(current: number, previous: number): { percent: number; direction: 'up' | 'down' | 'neutral' } {
  if (previous === 0 && current === 0) {return { percent: 0, direction: 'neutral' };}
  if (previous === 0) {return { percent: 100, direction: 'up' };}
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  if (percent > 0) {return { percent, direction: 'up' };}
  if (percent < 0) {return { percent: Math.abs(percent), direction: 'down' };}
  return { percent: 0, direction: 'neutral' };
}

function DeltaBadge({ percent, direction, compact }: { percent: number; direction: 'up' | 'down' | 'neutral'; compact?: boolean }) {
  const { t } = useLocalTranslation(translations);
  const iconSize = compact ? 12 : 14;

  if (direction === 'neutral') {
    return (
      <span className={`text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
        {t('noChange')}
      </span>
    );
  }

  const colorClass = direction === 'up' ? STATUS_COLORS.positive : STATUS_COLORS.negative;
  const Icon = direction === 'up' ? ArrowUp : ArrowDown;

  return (
    <span className={`inline-flex items-center gap-0.5 ${colorClass} ${compact ? 'text-xs' : 'text-sm'} font-medium`}>
      <Icon size={iconSize} />
      {percent.toFixed(1)}%
    </span>
  );
}

function SeriesNumber({
  label,
  total,
  previousTotal,
  color,
  primary,
  compact,
  showCompare,
}: {
  label: string;
  total: number;
  previousTotal?: number;
  color: string;
  primary: boolean;
  compact?: boolean;
  showCompare: boolean;
}) {
  const delta = useMemo(() => {
    if (!showCompare || previousTotal === undefined) {return null;}
    return computeDelta(total, previousTotal);
  }, [total, previousTotal, showCompare]);

  const valueSize = primary
    ? compact ? 'text-3xl' : 'text-5xl'
    : compact ? 'text-lg' : 'text-2xl';

  const labelSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div className={primary ? '' : ''}>
      <div className={`flex items-center gap-1.5 ${labelSize} text-muted-foreground mb-0.5`}>
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`${valueSize} font-bold tabular-nums text-foreground`}>
          {formatCompactNumber(total)}
        </span>
        {delta && <DeltaBadge percent={delta.percent} direction={delta.direction} compact={compact} />}
      </div>
    </div>
  );
}

export function TrendNumberViz({ series, previousSeries, compact }: TrendNumberVizProps) {
  const showCompare = !!previousSeries && previousSeries.length > 0;

  const seriesData = useMemo(() => {
    return series.map((s, idx) => {
      const total = s.data.reduce((acc, dp) => acc + dp.value, 0);
      const prevSeries = previousSeries?.[idx];
      const previousTotal = prevSeries
        ? prevSeries.data.reduce((acc, dp) => acc + dp.value, 0)
        : undefined;
      return {
        key: seriesKey(s),
        label: seriesKey(s),
        total,
        previousTotal,
        color: CHART_COLORS_HEX[idx % CHART_COLORS_HEX.length],
      };
    });
  }, [series, previousSeries]);

  if (seriesData.length === 0) {return null;}

  const hasSingleSeries = seriesData.length === 1;

  return (
    <div className={`flex ${hasSingleSeries ? 'items-center justify-center' : 'flex-col gap-4'} h-full ${compact ? 'px-2 py-1' : 'p-6'}`}>
      {/* Primary series */}
      <div className={hasSingleSeries ? 'text-center' : ''}>
        <SeriesNumber
          label={seriesData[0].label}
          total={seriesData[0].total}
          previousTotal={seriesData[0].previousTotal}
          color={seriesData[0].color}
          primary
          compact={compact}
          showCompare={showCompare}
        />
      </div>

      {/* Secondary series */}
      {seriesData.length > 1 && (
        <div className={`flex flex-wrap gap-x-6 gap-y-3 ${compact ? '' : 'border-t border-border pt-4'}`}>
          {seriesData.slice(1).map((s) => (
            <SeriesNumber
              key={s.key}
              label={s.label}
              total={s.total}
              previousTotal={s.previousTotal}
              color={s.color}
              primary={false}
              compact={compact}
              showCompare={showCompare}
            />
          ))}
        </div>
      )}
    </div>
  );
}
