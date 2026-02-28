import { useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Image, Download, ClipboardList, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { StatRow } from '@/components/ui/stat-row';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { RetentionChart } from '@/features/dashboard/components/widgets/retention/RetentionChart';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';
import { PathsChart } from '@/features/dashboard/components/widgets/paths/PathsChart';
import { CHART_COLORS_HEX, CHART_TOOLTIP_STYLE, CHART_GRID_COLOR, STATUS_COLORS_HEX, chartAxisTick } from '@/lib/chart-colors';
import { formatCompactNumber } from '@/lib/formatting';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useProjectId } from '@/hooks/use-project-id';
import translations from './ai-tool-result.translations';
import {
  toolResultToCsv,
  toolResultToMarkdown,
  downloadCsv,
  captureChartAsBlob,
  downloadChartAsPng,
  type AiToolResultData,
  type SegmentCompareResult,
  type TimeBetweenEventsResult,
  type RootCauseResult,
  type FunnelGapResult,
} from './ai-tool-result-export';
import {
  rootCauseToolOutputSchema,
  funnelGapToolOutputSchema,
  segmentCompareOutputSchema,
  histogramToolOutputSchema,
} from '@qurvo/ai-types';
import type {
  TrendSeriesResult,
  TrendGranularity,
  FunnelStepResult,
  RetentionResult,
  LifecycleResult,
  StickinessResult,
  PathTransition,
  TopPath,
} from '@/api/generated/Api';

interface TrendToolResult {
  series: TrendSeriesResult[];
  series_previous?: TrendSeriesResult[];
  granularity?: TrendGranularity;
}

interface FunnelToolResult {
  steps: FunnelStepResult[];
  breakdown?: boolean;
  aggregate_steps?: FunnelStepResult[];
}

interface PathsToolResult {
  transitions: PathTransition[];
  top_paths?: TopPath[];
}

function isTrendResult(r: Record<string, unknown>): r is Record<string, unknown> & TrendToolResult {
  return Array.isArray(r.series);
}

function isFunnelResult(r: Record<string, unknown>): r is Record<string, unknown> & FunnelToolResult {
  return Array.isArray(r.steps);
}

function isRetentionResult(r: Record<string, unknown>): r is Record<string, unknown> & RetentionResult {
  return Array.isArray(r.cohorts);
}

function isLifecycleResult(r: Record<string, unknown>): r is Record<string, unknown> & LifecycleResult {
  return Array.isArray(r.data);
}

function isStickinessResult(r: Record<string, unknown>): r is Record<string, unknown> & StickinessResult {
  return Array.isArray(r.data);
}

function isPathsResult(r: Record<string, unknown>): r is Record<string, unknown> & PathsToolResult {
  return Array.isArray(r.transitions);
}

function parseSegmentCompareResult(r: unknown): SegmentCompareResult | null {
  const result = segmentCompareOutputSchema.safeParse(r);
  return result.success ? result.data : null;
}

function parseHistogramResult(r: unknown): TimeBetweenEventsResult | null {
  const result = histogramToolOutputSchema.safeParse(r);
  return result.success ? result.data : null;
}

function parseRootCauseResult(r: unknown): RootCauseResult | null {
  const result = rootCauseToolOutputSchema.safeParse(r);
  return result.success ? result.data : null;
}

function parseFunnelGapResult(r: unknown): FunnelGapResult | null {
  const result = funnelGapToolOutputSchema.safeParse(r);
  return result.success ? result.data : null;
}

function parseToolResult(visualizationType: string | null, result: unknown): AiToolResultData | null {
  if (!visualizationType || !result || typeof result !== 'object') {return null;}
  const r = result as Record<string, unknown>;

  switch (visualizationType) {
    case 'trend_chart': {
      return isTrendResult(r) ? { type: 'trend_chart', data: r } : null;
    }
    case 'funnel_chart': {
      return isFunnelResult(r) ? { type: 'funnel_chart', data: r } : null;
    }
    case 'retention_chart': {
      return isRetentionResult(r) ? { type: 'retention_chart', data: r } : null;
    }
    case 'lifecycle_chart': {
      return isLifecycleResult(r) ? { type: 'lifecycle_chart', data: r } : null;
    }
    case 'stickiness_chart': {
      return isStickinessResult(r) ? { type: 'stickiness_chart', data: r } : null;
    }
    case 'paths_chart': {
      return isPathsResult(r) ? { type: 'paths_chart', data: r } : null;
    }
    case 'segment_compare_chart': {
      const parsed = parseSegmentCompareResult(r);
      return parsed ? { type: 'segment_compare_chart', data: parsed } : null;
    }
    case 'histogram_chart': {
      const parsed = parseHistogramResult(r);
      return parsed ? { type: 'histogram_chart', data: parsed } : null;
    }
    case 'root_cause_chart': {
      const parsed = parseRootCauseResult(r);
      return parsed ? { type: 'root_cause_chart', data: parsed } : null;
    }
    case 'funnel_gap_chart': {
      const parsed = parseFunnelGapResult(r);
      return parsed ? { type: 'funnel_gap_chart', data: parsed } : null;
    }
    default:
      return null;
  }
}

/**
 * ClickHouse returns bucket as "2026-02-22 00:00:00" but TrendChart expects
 * "2026-02-22" (day) or "2026-02-22T10" (hour). Normalize the format.
 */
function normalizeTrendSeries(series: TrendSeriesResult[]): TrendSeriesResult[] {
  return series.map((s) => ({
    ...s,
    data: s.data.map((dp) => ({
      ...dp,
      bucket: normalizeBucket(dp.bucket),
    })),
  }));
}

function normalizeBucket(bucket: string): string {
  if (!bucket) {return bucket;}
  // "2026-02-22 00:00:00" → "2026-02-22"
  const match = bucket.match(/^(\d{4}-\d{2}-\d{2}) 00:00:00$/);
  if (match) {return match[1];}
  // "2026-02-22 14:00:00" → "2026-02-22T14" (hourly)
  const hourMatch = bucket.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):00:00$/);
  if (hourMatch) {return `${hourMatch[1]}T${hourMatch[2]}`;}
  return bucket;
}

interface LinkToolResult {
  link: string;
  name?: string;
  insight_id?: string;
  widget_id?: string;
  dashboard_id?: string;
}

function isLinkResult(result: unknown): result is LinkToolResult {
  return typeof result === 'object' && result !== null && typeof (result as Record<string, unknown>).link === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLinkLabel(toolName: string, result: LinkToolResult, t: (key: any) => string): string {
  if (toolName === 'create_insight') {
    return result.name ? t('openInsight') + ': ' + result.name : t('openInsight');
  }
  if (toolName === 'save_to_dashboard') {
    return t('openDashboard');
  }
  return t('openLink');
}

interface SegmentCompareChartProps {
  data: SegmentCompareResult;
}

function SegmentCompareChart({ data }: SegmentCompareChartProps) {
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

function formatStatDuration(seconds: number): string {
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60);
    return mins <= 1 ? '< 1m' : `${mins}m`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return `${hours}h`;
  }
  const days = Math.round(seconds / 86400);
  return `${days}d`;
}

interface HistogramChartProps {
  data: TimeBetweenEventsResult;
}

function HistogramChart({ data }: HistogramChartProps) {
  const { t } = useLocalTranslation(translations);
  const { stats, buckets, total_users } = data;

  if (buckets.length === 0 || total_users === 0) {
    return <p className="text-sm text-muted-foreground">{t('noData')}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground">{t('totalUsers')}:</span> {total_users}</span>
        <span><span className="font-medium text-foreground">{t('median')}:</span> {formatStatDuration(stats.median_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('p75')}:</span> {formatStatDuration(stats.p75_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('p90')}:</span> {formatStatDuration(stats.p90_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('avg')}:</span> {formatStatDuration(stats.mean_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('min')}:</span> {formatStatDuration(stats.min_seconds)}</span>
        <span><span className="font-medium text-foreground">{t('max')}:</span> {formatStatDuration(stats.max_seconds)}</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={buckets}
          margin={{ top: 4, right: 10, bottom: 24, left: 10 }}
        >
          <XAxis
            dataKey="label"
            tick={chartAxisTick()}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={48}
          />
          <YAxis
            tick={chartAxisTick()}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatCompactNumber}
            width={44}
          />
          <RechartsTooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            formatter={(value: number) => [value, t('users')]}
          />
          <Bar dataKey="count" fill={CHART_COLORS_HEX[0]} radius={[4, 4, 0, 0]} name={t('users')} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface RootCauseChartProps {
  data: RootCauseResult;
}

function RootCauseChart({ data }: RootCauseChartProps) {
  const { t } = useLocalTranslation(translations);
  const { top_segments, overall } = data;

  const isPositiveOverall = overall.relative_change_pct >= 0;

  const chartData = top_segments.map((s) => ({
    name: `${s.dimension}: ${s.segment_value}`,
    contribution: s.contribution_pct,
    relativeChange: s.relative_change_pct,
  }));

  const barHeight = 28;
  const minHeight = 160;
  const height = Math.max(minHeight, chartData.length * barHeight + 80);

  const overallColorClass = isPositiveOverall ? 'text-emerald-400' : 'text-red-400';
  const overallSign = isPositiveOverall ? '+' : '';

  return (
    <div>
      <StatRow
        className="mb-3"
        items={[
          {
            label: t('overall'),
            value: `${overallSign}${overall.relative_change_pct.toFixed(1)}%`,
            valueClassName: overallColorClass,
          },
          {
            label: overall.metric,
            value: `${overallSign}${formatCompactNumber(overall.absolute_change)}`,
          },
        ]}
      />
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
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)}%`,
              name === 'contribution' ? t('contribution') : t('relativeChange'),
            ]}
          />
          <ReferenceLine x={0} stroke={CHART_GRID_COLOR} />
          <Bar dataKey="contribution" name={t('contribution')} radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.contribution >= 0 ? STATUS_COLORS_HEX.positive : STATUS_COLORS_HEX.negative}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface FunnelGapChartProps {
  data: FunnelGapResult;
}

function FunnelGapChart({ data }: FunnelGapChartProps) {
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

interface AiToolResultProps {
  toolName: string;
  result: unknown;
  visualizationType: string | null;
}

export function AiToolResult({ result, visualizationType, toolName }: AiToolResultProps) {
  const { t } = useLocalTranslation(translations);
  useProjectId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [isCopyingChart, setIsCopyingChart] = useState(false);

  const parsed = useMemo(
    () => parseToolResult(visualizationType, result),
    [visualizationType, result],
  );

  const handleCopyChart = useCallback(async () => {
    if (!chartRef.current || !parsed) {return;}
    setIsCopyingChart(true);
    try {
      const blob = await captureChartAsBlob(chartRef.current);
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        toast.success(t('chartCopied'));
      } catch (clipboardErr) {
        console.error('[copyChart]', clipboardErr);
        const filename = `chart_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
        downloadChartAsPng(blob, filename);
        toast.success(t('chartDownloaded'));
      }
    } catch (err) {
      console.error('[copyChart]', err);
      toast.error(t('copyError'));
    } finally {
      setIsCopyingChart(false);
    }
  }, [parsed, t]);

  const handleExportCsv = useCallback(() => {
    if (!parsed) {return;}
    try {
      const csv = toolResultToCsv(parsed);
      const filename = `${toolName}_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCsv(csv, filename);
      toast.success(t('csvExported'));
    } catch {
      toast.error(t('exportError'));
    }
  }, [parsed, toolName, t]);

  const handleCopyData = useCallback(async () => {
    if (!parsed) {return;}
    try {
      const markdown = toolResultToMarkdown(parsed);
      await navigator.clipboard.writeText(markdown);
      toast.success(t('dataCopied'));
    } catch {
      toast.error(t('copyError'));
    }
  }, [parsed, t]);

  if (!parsed) {
    if (isLinkResult(result) && (toolName === 'create_insight' || toolName === 'save_to_dashboard')) {
      const linkResult = result;
      const href = linkResult.link;
      const label = getLinkLabel(toolName, linkResult, t);
      return (
        <div className="my-1">
          <Button variant="outline" size="sm" asChild>
            <Link to={href}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              {label}
            </Link>
          </Button>
        </div>
      );
    }
    return null;
  }

  return (
    <Card className="my-2">
      <CardContent className="pt-4 pb-3">
        <div ref={chartRef}>
          {parsed.type === 'trend_chart' && (
            <TrendChart
              series={normalizeTrendSeries(parsed.data.series)}
              previousSeries={parsed.data.series_previous ? normalizeTrendSeries(parsed.data.series_previous) : undefined}
              chartType="line"
              granularity={parsed.data.granularity}
            />
          )}
          {parsed.type === 'funnel_chart' && (
            <FunnelChart
              steps={parsed.data.steps}
              breakdown={parsed.data.breakdown}
              aggregateSteps={parsed.data.aggregate_steps}
            />
          )}
          {parsed.type === 'retention_chart' && (
            <RetentionChart result={parsed.data} />
          )}
          {parsed.type === 'lifecycle_chart' && (
            <LifecycleChart result={parsed.data} />
          )}
          {parsed.type === 'stickiness_chart' && (
            <StickinessChart result={parsed.data} />
          )}
          {parsed.type === 'paths_chart' && (
            <PathsChart
              transitions={parsed.data.transitions}
              topPaths={parsed.data.top_paths ?? []}
            />
          )}
          {parsed.type === 'segment_compare_chart' && (
            <SegmentCompareChart data={parsed.data} />
          )}
          {parsed.type === 'histogram_chart' && (
            <HistogramChart data={parsed.data} />
          )}
          {parsed.type === 'root_cause_chart' && (
            <RootCauseChart data={parsed.data} />
          )}
          {parsed.type === 'funnel_gap_chart' && (
            <FunnelGapChart data={parsed.data} />
          )}
        </div>
        <div className="flex items-center gap-1 mt-2 pt-2 border-t">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCopyChart}
                disabled={isCopyingChart}
                aria-label={t('copyChart')}
              >
                <Image />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('copyChart')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleExportCsv}
                aria-label={t('exportCsv')}
              >
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('exportCsv')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCopyData}
                aria-label={t('copyData')}
              >
                <ClipboardList />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('copyData')}</TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  );
}
