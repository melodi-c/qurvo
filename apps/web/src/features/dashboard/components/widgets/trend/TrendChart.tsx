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
  Legend,
} from 'recharts';
import type { TrendSeriesResult, TrendWidgetConfigDtoChartTypeEnum } from '@/api/generated/Api';

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

interface TrendChartProps {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  chartType: TrendWidgetConfigDtoChartTypeEnum;
  compact?: boolean;
}

function formatBucket(bucket: string, compact?: boolean): string {
  if (!bucket) return '';
  // bucket is ISO date string or partial date
  if (bucket.length === 10) {
    // day: "2025-01-15"
    if (compact) return bucket.slice(5); // "01-15"
    return bucket.slice(5); // "01-15"
  }
  if (bucket.length === 7) {
    // month: "2025-01"
    return bucket;
  }
  if (bucket.includes('T')) {
    // hour: "2025-01-15T10:00:00"
    const d = new Date(bucket);
    if (compact) return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}h`;
    return `${bucket.slice(5, 10)} ${d.getHours()}:00`;
  }
  return bucket;
}

function buildDataPoints(
  series: TrendSeriesResult[],
  previousSeries?: TrendSeriesResult[],
) {
  // Collect all buckets
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
      // Map previous series data points by index
      for (const ps of previousSeries) {
        const key = `prev_${seriesKey(ps)}`;
        const dp = ps.data.find((d) => d.bucket === bucket);
        point[key] = dp?.value ?? 0;
      }
    }
    return point;
  });
}

function seriesKey(s: TrendSeriesResult): string {
  if (s.breakdown_value) return `${s.label} (${s.breakdown_value})`;
  return s.label;
}

export function TrendChart({ series, previousSeries, chartType, compact }: TrendChartProps) {
  const data = buildDataPoints(series, previousSeries);

  // Deduplicate series keys for rendering
  const seriesKeys = series.map((s) => seriesKey(s));
  const prevKeys = (previousSeries ?? []).map((s) => `prev_${seriesKey(s)}`);

  const height = compact ? '100%' : 400;
  const ChartComponent = chartType === 'bar' ? BarChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent data={data} margin={compact ? { top: 4, right: 8, left: -16, bottom: 0 } : { top: 8, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(v) => formatBucket(v, compact)}
          tick={{ fontSize: compact ? 10 : 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: compact ? 10 : 12, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          width={compact ? 32 : 48}
        />
        {!compact && (
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(v) => formatBucket(v as string)}
          />
        )}
        {!compact && seriesKeys.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
          />
        )}

        {/* Previous period (dashed) */}
        {prevKeys.map((key, i) => (
          chartType === 'bar' ? (
            <Bar
              key={key}
              dataKey={key}
              fill={COMPARE_COLORS[i % COMPARE_COLORS.length]}
              opacity={0.4}
              name={`${seriesKeys[i] ?? key} (prev)`}
            />
          ) : (
            <Line
              key={key}
              dataKey={key}
              stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
              strokeDasharray="5 5"
              strokeWidth={1.5}
              dot={false}
              name={`${seriesKeys[i] ?? key} (prev)`}
            />
          )
        ))}

        {/* Current period */}
        {seriesKeys.map((key, i) => (
          chartType === 'bar' ? (
            <Bar
              key={key}
              dataKey={key}
              fill={COLORS[i % COLORS.length]}
              radius={[2, 2, 0, 0]}
              name={key}
            />
          ) : (
            <Line
              key={key}
              dataKey={key}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={compact ? false : { r: 4 }}
              name={key}
            />
          )
        ))}
      </ChartComponent>
    </ResponsiveContainer>
  );
}
