import { useState, useMemo, useEffect } from 'react';
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
  ReferenceLine,
} from 'recharts';
import type {
  TrendSeriesResult,
  TrendFormula,
  ChartType,
  TrendGranularity,
  Annotation,
} from '@/api/generated/Api';
import { CHART_COLORS_HSL, CHART_COMPARE_COLORS_HSL, CHART_FORMULA_COLORS_HSL, CHART_TOOLTIP_STYLE, chartAxisTick } from '@/lib/chart-colors';
import { formatBucket, formatCompactNumber } from '@/lib/formatting';
import { seriesKey, isIncompleteBucket, buildDataPoints, snapAnnotationDateToBucket } from './trend-utils';
import { useFormulaResults } from '@/features/dashboard/hooks/use-formula-results';
import { CompactLegend, LegendTable } from './TrendLegendTable';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useProjectStore } from '@/stores/project';
import translations from './TrendChart.translations';

const COLORS = CHART_COLORS_HSL;
const COMPARE_COLORS = CHART_COMPARE_COLORS_HSL;
const FORMULA_COLORS = CHART_FORMULA_COLORS_HSL;

// ── Types ──

interface TrendChartProps {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  chartType: ChartType;
  granularity?: TrendGranularity;
  compact?: boolean;
  formulas?: TrendFormula[];
  annotations?: Annotation[];
}

// ── Shared rendering helpers ──

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

// ── Annotation rendering helper ──

function renderAnnotations(annotations: Annotation[] | undefined, granularity: string, compact?: boolean) {
  if (!annotations?.length) {return null;}
  return annotations.map((ann) => (
    <ReferenceLine
      key={ann.id}
      x={snapAnnotationDateToBucket(ann.date, granularity)}
      stroke={ann.color ?? 'hsl(var(--color-muted-foreground))'}
      strokeDasharray="4 2"
      label={compact ? undefined : { value: ann.label, position: 'insideTopLeft', fontSize: 11, fill: ann.color ?? 'hsl(var(--color-muted-foreground))' }}
    />
  ));
}

// ── Component ──

export function TrendChart({ series, previousSeries, chartType, granularity, compact, formulas, annotations }: TrendChartProps) {
  const { t } = useLocalTranslation(translations);
  const timezone = useProjectStore((s) => s.projectTimezone);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const allSeriesKeys = useMemo(() => series.map((s) => seriesKey(s)), [series]);

  // Reset hidden keys only when the actual set of series keys changes
  // (not on every data refresh — allSeriesKeys is a new array reference each time)
  const seriesKeysFingerprint = allSeriesKeys.join('\0');
  useEffect(() => {
    setHiddenKeys(new Set());
  }, [seriesKeysFingerprint]);
  const prevKeys = useMemo(
    () => (previousSeries ?? []).map((s) => `prev_${seriesKey(s)}`),
    [previousSeries],
  );

  const { formulaResults, formulaKeys, formulaTotals } = useFormulaResults(series, formulas);

  const data = useMemo(() => {
    const points = buildDataPoints(series, previousSeries);
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
  }, [series, previousSeries, formulaResults, formulaKeys]);

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
  };

  const height = compact ? '100%' : 350;
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
          <ResponsiveContainer width="100%" height={height}>
            <ChartComponent data={data} margin={fullMargin}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="bucket"
                tickFormatter={(v) => formatBucket(v, granularity ?? 'day', compact, timezone)}
                tick={tickStyle}
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
              {renderAnnotations(annotations, granularity ?? 'day', compact)}
            </ChartComponent>
          </ResponsiveContainer>
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
                  tickFormatter={(v) => formatBucket(v, granularity ?? 'day', compact, timezone)}
                  tick={chartAxisTick()}
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
                {renderAnnotations(annotations, granularity ?? 'day', compact)}
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
          </div>
        )}
      </div>

      {/* Compact legend (dashboard mode) */}
      {compact && allSeriesKeys.length > 1 && (
        <CompactLegend allSeriesKeys={allSeriesKeys} formulaKeys={formulaKeys} />
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
