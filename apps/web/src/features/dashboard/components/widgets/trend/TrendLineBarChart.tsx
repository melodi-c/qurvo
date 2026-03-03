import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type {
  TrendSeriesResult,
  TrendSeries,
  TrendFormula,
  ChartType,
  TrendGranularity,
  Annotation,
} from '@/api/generated/Api';
import { CHART_COLORS_HSL, CHART_COMPARE_COLORS_HSL, CHART_FORMULA_COLORS_HSL, CHART_TOOLTIP_STYLE, chartAxisTick, CHART_AXIS_TICK_COLOR } from '@/lib/chart-colors';
import { formatBucket, formatCompactNumber } from '@/lib/formatting';
import { seriesKey, isIncompleteBucket, buildDataPoints, type DateRangeParams } from './trend-utils';
import { useFormulaResults } from '@/features/dashboard/hooks/use-formula-results';
import { CompactLegend, LegendTable } from './TrendLegendTable';
import { AnnotationsOverlay } from './AnnotationsOverlay';
import { useAnnotationPositions } from './use-annotation-positions';
import { useAnnotationReferenceLines } from './AnnotationReferenceLine';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useProjectStore } from '@/stores/project';
import translations from './TrendChart.translations';

const COLORS = CHART_COLORS_HSL;
const COMPARE_COLORS = CHART_COMPARE_COLORS_HSL;
const FORMULA_COLORS = CHART_FORMULA_COLORS_HSL;

// Types

export interface TrendLineBarChartProps {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  chartType: ChartType;
  granularity?: TrendGranularity;
  compact?: boolean;
  formulas?: TrendFormula[];
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

  // Report pixel position to the hook
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

// Shared rendering helpers

interface SeriesRenderProps {
  visibleSeriesKeys: string[];
  visiblePrevKeys: string[];
  visibleFormulaKeys: string[];
  allSeriesKeys: string[];
  chartType: ChartType;
  compact?: boolean;
  prevLabel: string;
}

function renderPrevSeries({ visiblePrevKeys, allSeriesKeys, chartType, prevLabel }: SeriesRenderProps) {
  return visiblePrevKeys.map((key, i) =>
    chartType === 'bar' ? (
      <Bar key={key} dataKey={key} fill={COMPARE_COLORS[i % COMPARE_COLORS.length]} opacity={0.4} name={`${allSeriesKeys[i] ?? key} (${prevLabel})`} />
    ) : (
      <Line key={key} dataKey={key} stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeDasharray="5 5" strokeWidth={1.5} dot={false} name={`${allSeriesKeys[i] ?? key} (${prevLabel})`} />
    ),
  );
}

function renderCurrentSeries({ visibleSeriesKeys, allSeriesKeys, chartType, compact }: SeriesRenderProps) {
  return visibleSeriesKeys.map((key) => {
    const colorIdx = allSeriesKeys.indexOf(key);
    return chartType === 'bar' ? (
      <Bar key={key} dataKey={key} fill={COLORS[colorIdx % COLORS.length]} radius={[2, 2, 0, 0]} name={key} />
    ) : (
      <Line key={key} dataKey={key} stroke={COLORS[colorIdx % COLORS.length]} strokeWidth={2} dot={false} activeDot={compact ? false : { r: 4 }} name={key} />
    );
  });
}

function renderFormulaSeries({ visibleFormulaKeys, compact }: SeriesRenderProps) {
  return visibleFormulaKeys.map((key, idx) => (
    <Line key={key} dataKey={key} stroke={FORMULA_COLORS[idx % FORMULA_COLORS.length]} strokeDasharray="8 4" strokeWidth={2} dot={false} activeDot={compact ? false : { r: 4 }} name={key} />
  ));
}

// Helper: compute derived series data from raw props
interface SeriesDataOptions {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  formulas?: TrendFormula[];
  seriesConfig?: TrendSeries[];
  granularity?: TrendGranularity;
  timezone?: string;
  onToggleSeries?: (idx: number) => void;
  dateRange?: DateRangeParams;
}

function useSeriesData(opts: SeriesDataOptions) {
  const { series, previousSeries, formulas, seriesConfig, granularity, timezone, onToggleSeries, dateRange } = opts;
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

  const { formulaResults, formulaKeys, formulaTotals } = useFormulaResults(series, formulas);

  const data = useMemo(() => {
    const points = buildDataPoints(series, previousSeries, dateRange);
    if (formulaResults.length > 0) {
      for (const point of points) {
        const bucket = point.bucket as string;
        formulaResults.forEach((fr, idx) => {
          const dp = fr.dataPoints.find((d) => d.bucket === bucket);
          point[formulaKeys[idx]] = dp?.value ?? 0;
        });
      }
    }
    return points;
  }, [series, previousSeries, dateRange, formulaResults, formulaKeys]);

  const seriesTotals = useMemo(
    () => series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)),
    [series],
  );

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
  const visibleFormulaKeys = formulaKeys.filter((k) => !hiddenKeys.has(k));

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

  return {
    allSeriesKeys, prevKeys, formulaKeys, formulaTotals,
    data, seriesTotals, hasIncomplete, completeData, incompleteData,
    visibleSeriesKeys, visiblePrevKeys, visibleFormulaKeys,
    hiddenKeys, toggleSeries,
  };
}

// Component

// eslint-disable-next-line complexity
export function TrendLineBarChart({ series, previousSeries, chartType, granularity, compact, formulas, annotations, seriesConfig, onToggleSeries, onEditAnnotation, onDeleteAnnotation, onCreateAnnotation, dateFrom, dateTo }: TrendLineBarChartProps) {
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

  const {
    allSeriesKeys, formulaKeys, formulaTotals,
    data, seriesTotals, hasIncomplete, completeData, incompleteData,
    visibleSeriesKeys, visiblePrevKeys, visibleFormulaKeys,
    hiddenKeys, toggleSeries,
  } = useSeriesData({
    series, previousSeries, formulas, seriesConfig, granularity, timezone, onToggleSeries,
    dateRange: dateFrom && dateTo && granularity ? { dateFrom, dateTo, granularity, timezone } : undefined,
  });

  const ChartComponent = chartType === 'bar' ? BarChart : LineChart;
  const useSimpleChart = chartType === 'bar' || !hasIncomplete;

  const seriesProps: SeriesRenderProps = {
    visibleSeriesKeys,
    visiblePrevKeys,
    visibleFormulaKeys,
    allSeriesKeys,
    chartType,
    compact,
    prevLabel: t('prev'),
  };

  const tickStyle = chartAxisTick(compact);
  const fullMargin = compact
    ? { top: 4, right: 8, left: 0, bottom: 0 }
    : { top: 8, right: 24, left: 0, bottom: 0 };

  return (
    <div className={compact ? 'h-full' : ''}>
      {/* Chart */}
      <div style={{ height: compact ? '100%' : 350 }}>
        {useSimpleChart ? (
          <div className="relative" style={{ height: compact ? '100%' : 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ChartComponent data={data} margin={fullMargin}>
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
                {renderPrevSeries(seriesProps)}
                {renderCurrentSeries(seriesProps)}
                {renderFormulaSeries(seriesProps)}
                {annotationLines}
              </ChartComponent>
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
              <LineChart
                data={completeData}
                margin={fullMargin}
              >
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
                {renderPrevSeries(seriesProps)}
                {renderCurrentSeries(seriesProps)}
                {renderFormulaSeries(seriesProps)}
                {annotationLines}
              </LineChart>
            </ResponsiveContainer>

            {/* Incomplete data -- dashed overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={incompleteData}
                  margin={fullMargin}
                >
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
        <CompactLegend allSeriesKeys={allSeriesKeys} formulaKeys={formulaKeys} hiddenKeys={hiddenKeys} />
      )}

      {/* Legend table (not in compact mode) */}
      {!compact && (allSeriesKeys.length > 0 || formulaKeys.length > 0) && (
        <LegendTable
          allSeriesKeys={allSeriesKeys}
          formulaKeys={formulaKeys}
          seriesTotals={seriesTotals}
          formulaTotals={formulaTotals}
          hiddenKeys={hiddenKeys}
          onToggleSeries={toggleSeries}
          previousSeries={previousSeries}
        />
      )}
    </div>
  );
}
