import { useState, useMemo } from 'react';
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
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import type {
  TrendSeriesResult,
  ChartType,
  TrendGranularity,
} from '@/api/generated/Api';

// ── Colors ──

const COLORS = [
  'hsl(221, 83%, 53%)',   // blue-600
  'hsl(160, 84%, 39%)',   // emerald-600
  'hsl(38, 92%, 50%)',    // amber-500
  'hsl(263, 70%, 50%)',   // violet-500
  'hsl(350, 89%, 60%)',   // rose-500
];

const COMPARE_COLORS = [
  'hsl(221, 60%, 75%)',
  'hsl(160, 60%, 70%)',
  'hsl(38, 60%, 75%)',
  'hsl(263, 50%, 75%)',
  'hsl(350, 60%, 78%)',
];

// ── Types ──

interface TrendChartProps {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  chartType: ChartType;
  granularity?: TrendGranularity;
  compact?: boolean;
}

// ── Helpers ──

function seriesKey(s: TrendSeriesResult): string {
  if (s.breakdown_value) return `${s.label} (${s.breakdown_value})`;
  return s.label;
}

function formatBucket(bucket: string, compact?: boolean): string {
  if (!bucket) return '';
  if (bucket.length === 10) return bucket.slice(5);  // "01-15"
  if (bucket.length === 7) return bucket;              // "2025-01"
  if (bucket.includes('T')) {
    const d = new Date(bucket);
    if (compact) return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}h`;
    return `${bucket.slice(5, 10)} ${d.getHours()}:00`;
  }
  return bucket;
}

/** Detect if a bucket falls in the current (incomplete) period. */
function isIncompleteBucket(bucket: string, granularity?: string): boolean {
  if (!granularity) return false;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (granularity === 'hour') {
    // Current hour
    const currentHour = now.toISOString().slice(0, 13); // "2025-01-15T10"
    return bucket.startsWith(currentHour);
  }
  if (granularity === 'day') return bucket === today;
  if (granularity === 'week') {
    // Current week: bucket date <= today && bucket date + 7 > today
    const bucketDate = new Date(bucket.slice(0, 10));
    const diffDays = (now.getTime() - bucketDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 7;
  }
  if (granularity === 'month') {
    return bucket.slice(0, 7) === today.slice(0, 7);
  }
  return false;
}

function buildDataPoints(
  series: TrendSeriesResult[],
  previousSeries?: TrendSeriesResult[],
) {
  const bucketSet = new Set<string>();
  for (const s of series) {
    for (const dp of s.data) bucketSet.add(dp.bucket);
  }
  const buckets = Array.from(bucketSet).sort();

  return buckets.map((bucket) => {
    const point: Record<string, string | number> = { bucket };
    for (const s of series) {
      const key = seriesKey(s);
      const dp = s.data.find((d) => d.bucket === bucket);
      point[key] = dp?.value ?? 0;
    }
    if (previousSeries) {
      for (const ps of previousSeries) {
        const key = `prev_${seriesKey(ps)}`;
        const dp = ps.data.find((d) => d.bucket === bucket);
        point[key] = dp?.value ?? 0;
      }
    }
    return point;
  });
}

// ── Component ──

export function TrendChart({ series, previousSeries, chartType, granularity, compact }: TrendChartProps) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const allSeriesKeys = useMemo(() => series.map((s) => seriesKey(s)), [series]);
  const prevKeys = useMemo(
    () => (previousSeries ?? []).map((s) => `prev_${seriesKey(s)}`),
    [previousSeries],
  );

  const data = useMemo(
    () => buildDataPoints(series, previousSeries),
    [series, previousSeries],
  );

  // Series totals for legend table
  const seriesTotals = useMemo(
    () => series.map((s) => s.data.reduce((acc, dp) => acc + dp.value, 0)),
    [series],
  );

  // Find the last complete bucket index for dashed line split
  const lastCompleteBucketIdx = useMemo(() => {
    if (!granularity || data.length === 0) return data.length - 1;
    for (let i = data.length - 1; i >= 0; i--) {
      if (!isIncompleteBucket(data[i].bucket as string, granularity)) return i;
    }
    return -1;
  }, [data, granularity]);

  // Split data into complete and incomplete for dashed line effect
  const hasIncomplete = lastCompleteBucketIdx < data.length - 1 && lastCompleteBucketIdx >= 0;

  // For line chart: we split into two datasets — complete and incomplete (overlap by 1 point)
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
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const height = compact ? '100%' : 350;
  const ChartComponent = chartType === 'bar' ? BarChart : LineChart;

  // For line chart with incomplete period, we render two charts overlaid
  // For bar chart, we just dim the last bar via a custom shape (simpler: skip incomplete splitting)
  const useSimpleChart = chartType === 'bar' || !hasIncomplete;

  return (
    <div className={compact ? 'h-full' : ''}>
      {/* Chart */}
      <div style={{ height: compact ? '100%' : 350 }}>
        {useSimpleChart ? (
          <ResponsiveContainer width="100%" height={height}>
            <ChartComponent
              data={data}
              margin={compact ? { top: 4, right: 8, left: -16, bottom: 0 } : { top: 8, right: 24, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="bucket"
                tickFormatter={(v) => formatBucket(v, compact)}
                tick={{ fontSize: compact ? 10 : 12, fill: 'var(--color-muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: compact ? 10 : 12, fill: 'var(--color-muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={compact ? 32 : 48}
              />
              {!compact && (
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'var(--color-popover-foreground)',
                  }}
                  labelFormatter={(v) => formatBucket(v as string)}
                />
              )}

              {/* Previous period */}
              {visiblePrevKeys.map((key, i) =>
                chartType === 'bar' ? (
                  <Bar key={key} dataKey={key} fill={COMPARE_COLORS[i % COMPARE_COLORS.length]} opacity={0.4} name={`${allSeriesKeys[i] ?? key} (prev)`} />
                ) : (
                  <Line key={key} dataKey={key} stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeDasharray="5 5" strokeWidth={1.5} dot={false} name={`${allSeriesKeys[i] ?? key} (prev)`} />
                ),
              )}

              {/* Current period */}
              {visibleSeriesKeys.map((key) => {
                const colorIdx = allSeriesKeys.indexOf(key);
                return chartType === 'bar' ? (
                  <Bar key={key} dataKey={key} fill={COLORS[colorIdx % COLORS.length]} radius={[2, 2, 0, 0]} name={key} />
                ) : (
                  <Line key={key} dataKey={key} stroke={COLORS[colorIdx % COLORS.length]} strokeWidth={2} dot={false} activeDot={compact ? false : { r: 4 }} name={key} />
                );
              })}
            </ChartComponent>
          </ResponsiveContainer>
        ) : (
          /* Line chart with incomplete period dashed */
          <div className="relative" style={{ height: compact ? '100%' : 350 }}>
            {/* Complete data — solid lines */}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={completeData}
                margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(v) => formatBucket(v, compact)}
                  tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[data[0]?.bucket, data[data.length - 1]?.bucket]}
                  type="category"
                  allowDuplicatedCategory={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'var(--color-popover-foreground)',
                  }}
                  labelFormatter={(v) => formatBucket(v as string)}
                />
                {visiblePrevKeys.map((key, i) => (
                  <Line key={key} dataKey={key} stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeDasharray="5 5" strokeWidth={1.5} dot={false} name={`${allSeriesKeys[i] ?? key} (prev)`} />
                ))}
                {visibleSeriesKeys.map((key) => {
                  const colorIdx = allSeriesKeys.indexOf(key);
                  return (
                    <Line key={key} dataKey={key} stroke={COLORS[colorIdx % COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} name={key} />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>

            {/* Incomplete data — dashed overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={incompleteData}
                  margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="bucket" hide domain={[data[0]?.bucket, data[data.length - 1]?.bucket]} type="category" allowDuplicatedCategory={false} />
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

      {/* Legend table (not in compact mode) */}
      {!compact && allSeriesKeys.length > 0 && (
        <div className="mt-4 border-t border-border/40">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b-0">
                <TableHead className="h-8 text-muted-foreground/60 text-xs font-medium">Series</TableHead>
                <TableHead className="h-8 text-muted-foreground/60 text-xs font-medium text-right w-28">Total</TableHead>
                {previousSeries && previousSeries.length > 0 && (
                  <TableHead className="h-8 text-muted-foreground/60 text-xs font-medium text-right w-28">Previous</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSeriesKeys.map((key, idx) => {
                const isHidden = hiddenKeys.has(key);
                const total = seriesTotals[idx] ?? 0;
                const prevTotal = previousSeries?.[idx]
                  ? previousSeries[idx].data.reduce((acc, dp) => acc + dp.value, 0)
                  : undefined;
                const color = COLORS[idx % COLORS.length];

                return (
                  <TableRow
                    key={key}
                    className={`cursor-pointer ${isHidden ? 'opacity-35' : ''}`}
                    onClick={() => toggleSeries(key)}
                  >
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: isHidden ? 'var(--color-muted-foreground)' : color }}
                        />
                        <span className={`truncate ${isHidden ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {key}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums font-medium text-foreground">
                      {total.toLocaleString()}
                    </TableCell>
                    {previousSeries && previousSeries.length > 0 && (
                      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
                        {prevTotal !== undefined ? prevTotal.toLocaleString() : '\u2014'}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
