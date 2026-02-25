import { useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Image, Download, ClipboardList, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { TrendChart } from '@/features/dashboard/components/widgets/trend/TrendChart';
import { FunnelChart } from '@/features/dashboard/components/widgets/funnel/FunnelChart';
import { RetentionChart } from '@/features/dashboard/components/widgets/retention/RetentionChart';
import { LifecycleChart } from '@/features/dashboard/components/widgets/lifecycle/LifecycleChart';
import { StickinessChart } from '@/features/dashboard/components/widgets/stickiness/StickinessChart';
import { PathsChart } from '@/features/dashboard/components/widgets/paths/PathsChart';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useProjectId } from '@/hooks/use-project-id';
import translations from './ai-tool-result.translations';
import {
  toolResultToCsv,
  toolResultToMarkdown,
  downloadCsv,
  captureChartAsBlob,
  type AiToolResultData,
} from './ai-tool-result-export';
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

function parseToolResult(visualizationType: string | null, result: unknown): AiToolResultData | null {
  if (!visualizationType || !result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  switch (visualizationType) {
    case 'trend_chart':
      return isTrendResult(r) ? { type: 'trend_chart', data: r } : null;
    case 'funnel_chart':
      return isFunnelResult(r) ? { type: 'funnel_chart', data: r } : null;
    case 'retention_chart':
      return isRetentionResult(r) ? { type: 'retention_chart', data: r } : null;
    case 'lifecycle_chart':
      return isLifecycleResult(r) ? { type: 'lifecycle_chart', data: r } : null;
    case 'stickiness_chart':
      return isStickinessResult(r) ? { type: 'stickiness_chart', data: r } : null;
    case 'paths_chart':
      return isPathsResult(r) ? { type: 'paths_chart', data: r } : null;
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
  if (!bucket) return bucket;
  // "2026-02-22 00:00:00" → "2026-02-22"
  const match = bucket.match(/^(\d{4}-\d{2}-\d{2}) 00:00:00$/);
  if (match) return match[1];
  // "2026-02-22 14:00:00" → "2026-02-22T14" (hourly)
  const hourMatch = bucket.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):00:00$/);
  if (hourMatch) return `${hourMatch[1]}T${hourMatch[2]}`;
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

interface AiToolResultProps {
  toolName: string;
  result: unknown;
  visualizationType: string | null;
}

export function AiToolResult({ result, visualizationType, toolName }: AiToolResultProps) {
  const { t } = useLocalTranslation(translations);
  const projectId = useProjectId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [isCopyingChart, setIsCopyingChart] = useState(false);

  const parsed = useMemo(
    () => parseToolResult(visualizationType, result),
    [visualizationType, result],
  );

  const handleCopyChart = useCallback(async () => {
    if (!chartRef.current || !parsed) return;
    setIsCopyingChart(true);
    try {
      const blob = await captureChartAsBlob(chartRef.current);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      toast.success(t('chartCopied'));
    } catch {
      toast.error(t('copyError'));
    } finally {
      setIsCopyingChart(false);
    }
  }, [parsed, t]);

  const handleExportCsv = useCallback(() => {
    if (!parsed) return;
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
    if (!parsed) return;
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
      const linkResult = result as LinkToolResult;
      const href = projectId ? `${linkResult.link}?project=${projectId}` : linkResult.link;
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
