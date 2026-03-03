import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type {
  TrendSeriesResult,
  TrendSeries,
  TrendGranularity,
  Annotation,
} from '@/api/generated/Api';
import { CHART_COLORS_HSL, CHART_COMPARE_COLORS_HSL, CHART_TOOLTIP_STYLE, chartAxisTick, CHART_AXIS_TICK_COLOR } from '@/lib/chart-colors';
import { formatBucket, formatCompactNumber } from '@/lib/formatting';
import { seriesKey, isIncompleteBucket, buildCumulativeDataPoints, type DateRangeParams } from './trend-utils';
import { CompactLegend, LegendTable } from './TrendLegendTable';
import { AnnotationsOverlay } from './AnnotationsOverlay';
import { useAnnotationPositions } from './use-annotation-positions';
import { useAnnotationReferenceLines } from './AnnotationReferenceLine';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useProjectStore } from '@/stores/project';
import translations from './TrendChart.translations';

const COLORS = CHART_COLORS_HSL;
const COMPARE_COLORS = CHART_COMPARE_COLORS_HSL;

// Custom XAxis tick that reports its pixel position for the annotation overlay
interface CustomTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
  granularity: string;
  compact?: boolean;
  timezone?: string;
  onTickRender: (bucket: string, x: number) => void;
}

function CustomXAxisTick({ x, y, payload, granularity, compact, timezone, onTickRender }: CustomTickProps) {
  const tickValue = payload?.value ?? '';
  const tickX = x ?? 0;

  useEffect(() => {
    if (tickValue && tickX > 0) {
      onTickRender(tickValue, tickX);
    }
  }, [tickValue, tickX, onTickRender]);

  const label = formatBucket(tickValue, granularity, compact, timezone);
  const style = chartAxisTick(compact);

  return (
    <text x={tickX} y={(y ?? 0) + 12} textAnchor="middle" fontSize={style.fontSize} fill={CHART_AXIS_TICK_COLOR}>
      {label}
    </text>
  );
}

interface TrendCumulativeChartProps {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  granularity?: TrendGranularity;
  compact?: boolean;
  annotations?: Annotation[];
  /** Series config for persisted hidden state */
  seriesConfig?: TrendSeries[];
  /** Called when a series is toggled — allows persisting hidden state to config */
  onToggleSeries?: (seriesIdx: number) => void;
  /** CRUD callbacks — when provided, renders interactive annotation overlay */
  onEditAnnotation?: (annotation: Annotation) => void;
  onDeleteAnnotation?: (id: string) => Promise<void>;
  onCreateAnnotation?: (date: string) => void;
  /** Date range for generating full X axis bucket set */
  dateFrom?: string;
  dateTo?: string;
}

// eslint-disable-next-line complexity
export function TrendCumulativeChart({
  series,
  previousSeries,
  granularity,
  compact,
  annotations,
  seriesConfig,
  onToggleSeries,
  onEditAnnotation,
  onDeleteAnnotation,
  onCreateAnnotation,
  dateFrom,
  dateTo,
}: TrendCumulativeChartProps) {
  const { t } = useLocalTranslation(translations);
  const timezone = useProjectStore((s) => s.projectTimezone);
  const showOverlay = !compact && !!onEditAnnotation;
  const { tickPositions, annotationsByBucket, onTickRender } = useAnnotationPositions(
    showOverlay ? annotations : undefined,
    granularity,
  );
  const annotationLines = useAnnotationReferenceLines(annotations, granularity ?? 'day', compact);

  const customTick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <CustomXAxisTick
        {...props}
        granularity={granularity ?? 'day'}
        compact={compact}
        timezone={timezone}
        onTickRender={onTickRender}
      />
    ),
    [granularity, compact, timezone, onTickRender],
  );

  // Series keys & visibility
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const allSeriesKeys = useMemo(() => series.map((s) => seriesKey(s)), [series]);

  const seriesKeysFingerprint = allSeriesKeys.join('\0');
  const hiddenFingerprint = seriesConfig?.map((s) => s.hidden ? '1' : '0').join('') ?? '';
  useEffect(() => {
    if (seriesConfig) {
      const initialHidden = new Set<string>();
      series.forEach((s, idx) => {
        if (seriesConfig[idx]?.hidden) {initialHidden.add(seriesKey(s));}
      });
      setHiddenKeys(initialHidden);
    } else {
      setHiddenKeys(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKeysFingerprint, hiddenFingerprint]);

  const prevKeys = useMemo(
    () => (previousSeries ?? []).map((s) => `prev_${seriesKey(s)}`),
    [previousSeries],
  );

  // Build cumulative data points (no formulas for cumulative)
  const dateRange: DateRangeParams | undefined = dateFrom && dateTo && granularity
    ? { dateFrom, dateTo, granularity, timezone }
    : undefined;
  const data = useMemo(
    () => buildCumulativeDataPoints(series, previousSeries, dateRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, previousSeries, dateFrom, dateTo, granularity],
  );

  // Totals: use last cumulative value (final running total)
  const seriesTotals = useMemo(
    () => series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)),
    [series],
  );

  // Incomplete bucket detection
  const lastCompleteBucketIdx = useMemo(() => {
    if (!granularity || data.length === 0) {return data.length - 1;}
    for (let i = data.length - 1; i >= 0; i--) {
      if (!isIncompleteBucket(data[i].bucket as string, granularity, timezone)) {return i;}
    }
    return -1;
  }, [data, granularity, timezone]);

  const hasIncomplete = lastCompleteBucketIdx < data.length - 1 && lastCompleteBucketIdx >= 0;
  const completeData = hasIncomplete ? data.slice(0, lastCompleteBucketIdx + 1) : data;
  const incompleteData = hasIncomplete ? data.slice(lastCompleteBucketIdx) : [];

  const visibleSeriesKeys = allSeriesKeys.filter((k) => !hiddenKeys.has(k));
  const visiblePrevKeys = prevKeys.filter((k) => {
    const originalKey = k.replace(/^prev_/, '');
    return !hiddenKeys.has(originalKey);
  });

  const toggleSeries = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {next.delete(key);}
      else {next.add(key);}
      return next;
    });
    if (onToggleSeries) {
      const idx = allSeriesKeys.indexOf(key);
      if (idx >= 0) {onToggleSeries(idx);}
    }
  };

  const tickStyle = chartAxisTick(compact);
  const fullMargin = compact
    ? { top: 4, right: 8, left: 0, bottom: 0 }
    : { top: 8, right: 24, left: 0, bottom: 0 };

  // Render helpers
  const renderPrevLines = () =>
    visiblePrevKeys.map((key, i) => (
      <Line
        key={key}
        dataKey={key}
        stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
        strokeDasharray="5 5"
        strokeWidth={1.5}
        dot={false}
        name={`${allSeriesKeys[i] ?? key} (${t('prev')})`}
      />
    ));

  const renderCurrentLines = () =>
    visibleSeriesKeys.map((key) => {
      const colorIdx = allSeriesKeys.indexOf(key);
      return (
        <Line
          key={key}
          dataKey={key}
          stroke={COLORS[colorIdx % COLORS.length]}
          strokeWidth={2}
          dot={false}
          activeDot={compact ? false : { r: 4 }}
          name={key}
        />
      );
    });

  const useSimpleChart = !hasIncomplete;

  return (
    <div className={compact ? 'h-full' : ''}>
      {/* Chart */}
      <div style={{ height: compact ? '100%' : 350 }}>
        {useSimpleChart ? (
          <div className="relative" style={{ height: compact ? '100%' : 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={fullMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={showOverlay ? undefined : (v) => formatBucket(v, granularity ?? 'day', compact, timezone)}
                  tick={showOverlay ? customTick : tickStyle}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={tickStyle}
                  tickLine={false}
                  axisLine={false}
                  width={compact ? 40 : 48}
                  tickFormatter={compact ? formatCompactNumber : undefined}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelFormatter={(v) => formatBucket(v as string, granularity ?? 'day', false, timezone)}
                />
                {renderPrevLines()}
                {renderCurrentLines()}
                {annotationLines}
              </LineChart>
            </ResponsiveContainer>
            {showOverlay && onDeleteAnnotation && onCreateAnnotation && (
              <AnnotationsOverlay
                tickPositions={tickPositions}
                annotationsByBucket={annotationsByBucket}
                granularity={granularity ?? 'day'}
                timezone={timezone}
                onEdit={onEditAnnotation}
                onDelete={onDeleteAnnotation}
                onCreate={onCreateAnnotation}
              />
            )}
          </div>
        ) : (
          /* Line chart with incomplete period dashed */
          <div className="relative" style={{ height: compact ? '100%' : 350 }}>
            {/* Complete data -- solid lines */}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={completeData} margin={fullMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={showOverlay ? undefined : (v) => formatBucket(v, granularity ?? 'day', compact, timezone)}
                  tick={showOverlay ? customTick : chartAxisTick()}
                  tickLine={false}
                  axisLine={false}
                  domain={data.length > 0 ? [data[0].bucket, data[data.length - 1].bucket] : undefined}
                  type="category"
                  allowDuplicatedCategory={false}
                />
                <YAxis
                  tick={chartAxisTick()}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelFormatter={(v) => formatBucket(v as string, granularity ?? 'day', false, timezone)}
                />
                {renderPrevLines()}
                {renderCurrentLines()}
                {annotationLines}
              </LineChart>
            </ResponsiveContainer>

            {/* Incomplete data -- dashed overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={incompleteData} margin={fullMargin}>
                  <XAxis dataKey="bucket" hide domain={data.length > 0 ? [data[0].bucket, data[data.length - 1].bucket] : undefined} type="category" allowDuplicatedCategory={false} />
                  <YAxis hide width={48} />
                  {visibleSeriesKeys.map((key) => {
                    const colorIdx = allSeriesKeys.indexOf(key);
                    return (
                      <Line key={`inc_${key}`} dataKey={key} stroke={COLORS[colorIdx % COLORS.length]} strokeDasharray="6 4" strokeWidth={2} dot={false} name={key} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {showOverlay && onDeleteAnnotation && onCreateAnnotation && (
              <AnnotationsOverlay
                tickPositions={tickPositions}
                annotationsByBucket={annotationsByBucket}
                granularity={granularity ?? 'day'}
                timezone={timezone}
                onEdit={onEditAnnotation}
                onDelete={onDeleteAnnotation}
                onCreate={onCreateAnnotation}
              />
            )}
          </div>
        )}
      </div>

      {/* Compact legend (dashboard mode) */}
      {compact && allSeriesKeys.length > 1 && (
        <CompactLegend allSeriesKeys={allSeriesKeys} formulaKeys={[]} hiddenKeys={hiddenKeys} />
      )}

      {/* Legend table (not in compact mode) */}
      {!compact && allSeriesKeys.length > 0 && (
        <LegendTable
          allSeriesKeys={allSeriesKeys}
          formulaKeys={[]}
          seriesTotals={seriesTotals}
          formulaTotals={[]}
          hiddenKeys={hiddenKeys}
          onToggleSeries={toggleSeries}
          previousSeries={previousSeries}
        />
      )}
    </div>
  );
}
