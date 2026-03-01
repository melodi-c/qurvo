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
import type {
  SegmentCompareOutput,
  HistogramToolOutput,
  RootCauseToolOutput,
  FunnelGapToolOutput,
} from '@qurvo/ai-types';

// Types

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

// Re-export shared types from @qurvo/ai-types for consumers of this module
export type SegmentCompareResult = SegmentCompareOutput;
export type TimeBetweenEventsResult = HistogramToolOutput;
export type RootCauseResult = RootCauseToolOutput;
export type FunnelGapResult = FunnelGapToolOutput;

// Re-export sub-types for component props
export type { RootCauseSegment, RootCauseOverall, FunnelGapItem } from '@qurvo/ai-types';

export type AiToolResultData =
  | { type: 'trend_chart'; data: TrendToolResult }
  | { type: 'funnel_chart'; data: FunnelToolResult }
  | { type: 'retention_chart'; data: RetentionResult }
  | { type: 'lifecycle_chart'; data: LifecycleResult }
  | { type: 'stickiness_chart'; data: StickinessResult }
  | { type: 'paths_chart'; data: PathsToolResult }
  | { type: 'segment_compare_chart'; data: SegmentCompareResult }
  | { type: 'histogram_chart'; data: TimeBetweenEventsResult }
  | { type: 'root_cause_chart'; data: RootCauseResult }
  | { type: 'funnel_gap_chart'; data: FunnelGapResult };

// CSV helpers

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {return '';}
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRows(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines: string[] = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  return lines.join('\n');
}

function trendToCsv(data: TrendToolResult): string {
  const headers = ['series', 'event', 'bucket', 'value'];
  const rows: (string | number)[][] = [];
  for (const s of data.series) {
    for (const dp of s.data) {
      rows.push([s.label, s.event_name, dp.bucket, dp.value]);
    }
  }
  return buildCsvRows(headers, rows);
}

function funnelToCsv(data: FunnelToolResult): string {
  const headers = ['step', 'label', 'event', 'count', 'conversion_rate', 'drop_off', 'drop_off_rate'];
  const rows = data.steps.map((s) => [
    s.step,
    s.label,
    s.event_name,
    s.count,
    (s.conversion_rate * 100).toFixed(2) + '%',
    s.drop_off,
    (s.drop_off_rate * 100).toFixed(2) + '%',
  ]);
  return buildCsvRows(headers, rows);
}

function retentionToCsv(data: RetentionResult): string {
  const maxPeriods = Math.max(0, ...data.cohorts.map((c) => c.periods.length));
  const periodHeaders = Array.from({ length: maxPeriods }, (_, i) => `period_${i}`);
  const headers = ['cohort_date', 'cohort_size', ...periodHeaders];
  const rows = data.cohorts.map((c) => [
    c.cohort_date,
    c.cohort_size,
    ...c.periods.map((p) => (p * 100).toFixed(1) + '%'),
  ]);
  return buildCsvRows(headers, rows);
}

function lifecycleToCsv(data: LifecycleResult): string {
  const headers = ['bucket', 'new', 'returning', 'resurrecting', 'dormant'];
  const rows = data.data.map((d) => [d.bucket, d.new, d.returning, d.resurrecting, d.dormant]);
  return buildCsvRows(headers, rows);
}

function stickinessToCsv(data: StickinessResult): string {
  const headers = ['period_count', 'user_count'];
  const rows = data.data.map((d) => [d.period_count, d.user_count]);
  return buildCsvRows(headers, rows);
}

function pathsToCsv(data: PathsToolResult): string {
  const headers = ['step', 'source', 'target', 'person_count'];
  const rows = data.transitions.map((t) => [t.step, t.source, t.target, t.person_count]);
  return buildCsvRows(headers, rows);
}

function histogramToCsv(data: TimeBetweenEventsResult): string {
  const headers = ['bucket', 'from_seconds', 'to_seconds', 'count'];
  const rows = data.buckets.map((b) => [b.label, b.from_seconds, b.to_seconds, b.count]);
  return buildCsvRows(headers, rows);
}

function rootCauseToCsv(data: RootCauseResult): string {
  const headers = ['dimension', 'segment_value', 'contribution_pct', 'relative_change_pct'];
  const rows = data.top_segments.map((s) => [
    s.dimension,
    s.segment_value,
    s.contribution_pct.toFixed(2) + '%',
    s.relative_change_pct.toFixed(2) + '%',
  ]);
  return buildCsvRows(headers, rows);
}

function funnelGapToCsv(data: FunnelGapResult): string {
  const headers = ['event_name', 'relative_lift_pct', 'users_with_event', 'users_without_event'];
  const rows = data.items.map((item) => [
    item.event_name,
    item.relative_lift_pct.toFixed(2) + '%',
    item.users_with_event,
    item.users_without_event,
  ]);
  return buildCsvRows(headers, rows);
}

function segmentCompareToCsv(data: SegmentCompareResult): string {
  const headers = ['segment', 'value', 'raw_count', 'unique_users'];
  const rows: (string | number)[][] = [
    [data.segment_a.name, data.segment_a.value, data.segment_a.raw_count, data.segment_a.unique_users],
    [data.segment_b.name, data.segment_b.value, data.segment_b.raw_count, data.segment_b.unique_users],
  ];
  return buildCsvRows(headers, rows);
}

export function toolResultToCsv(parsed: AiToolResultData): string {
  switch (parsed.type) {
    case 'trend_chart':
      return trendToCsv(parsed.data);
    case 'funnel_chart':
      return funnelToCsv(parsed.data);
    case 'retention_chart':
      return retentionToCsv(parsed.data);
    case 'lifecycle_chart':
      return lifecycleToCsv(parsed.data);
    case 'stickiness_chart':
      return stickinessToCsv(parsed.data);
    case 'paths_chart':
      return pathsToCsv(parsed.data);
    case 'segment_compare_chart':
      return segmentCompareToCsv(parsed.data);
    case 'histogram_chart':
      return histogramToCsv(parsed.data);
    case 'root_cause_chart':
      return rootCauseToCsv(parsed.data);
    case 'funnel_gap_chart':
      return funnelGapToCsv(parsed.data);
  }
}

// Markdown table helpers

function padRow(cells: string[], widths: number[]): string {
  return '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
}

function buildMarkdownTable(headers: string[], rows: string[][]): string {
  const allRows = [headers, ...rows];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...allRows.map((r) => (r[i] ?? '').length)),
  );
  const separator = '| ' + widths.map((w) => '-'.repeat(w)).join(' | ') + ' |';
  const lines: string[] = [
    padRow(headers, widths),
    separator,
    ...rows.map((r) => padRow(r, widths)),
  ];
  return lines.join('\n');
}

function trendToMarkdown(data: TrendToolResult): string {
  const headers = ['Series', 'Event', 'Bucket', 'Value'];
  const rows: string[][] = [];
  for (const s of data.series) {
    for (const dp of s.data) {
      rows.push([s.label, s.event_name, dp.bucket, String(dp.value)]);
    }
  }
  return buildMarkdownTable(headers, rows);
}

function funnelToMarkdown(data: FunnelToolResult): string {
  const headers = ['Step', 'Label', 'Event', 'Count', 'Conversion', 'Drop-off'];
  const rows = data.steps.map((s) => [
    String(s.step),
    s.label,
    s.event_name,
    String(s.count),
    (s.conversion_rate * 100).toFixed(1) + '%',
    (s.drop_off_rate * 100).toFixed(1) + '%',
  ]);
  return buildMarkdownTable(headers, rows);
}

function retentionToMarkdown(data: RetentionResult): string {
  const maxPeriods = Math.max(0, ...data.cohorts.map((c) => c.periods.length));
  const periodHeaders = Array.from({ length: maxPeriods }, (_, i) => `P${i}`);
  const headers = ['Cohort', 'Size', ...periodHeaders];
  const rows = data.cohorts.map((c) => [
    c.cohort_date,
    String(c.cohort_size),
    ...c.periods.map((p) => (p * 100).toFixed(0) + '%'),
  ]);
  return buildMarkdownTable(headers, rows);
}

function lifecycleToMarkdown(data: LifecycleResult): string {
  const headers = ['Bucket', 'New', 'Returning', 'Resurrecting', 'Dormant'];
  const rows = data.data.map((d) => [
    d.bucket,
    String(d.new),
    String(d.returning),
    String(d.resurrecting),
    String(d.dormant),
  ]);
  return buildMarkdownTable(headers, rows);
}

function stickinessToMarkdown(data: StickinessResult): string {
  const headers = ['Period Count', 'User Count'];
  const rows = data.data.map((d) => [String(d.period_count), String(d.user_count)]);
  return buildMarkdownTable(headers, rows);
}

function pathsToMarkdown(data: PathsToolResult): string {
  const headers = ['Step', 'Source', 'Target', 'Users'];
  const rows = data.transitions.map((t) => [
    String(t.step),
    t.source,
    t.target,
    String(t.person_count),
  ]);
  return buildMarkdownTable(headers, rows);
}

function histogramToMarkdown(data: TimeBetweenEventsResult): string {
  const headers = ['Bucket', 'Users'];
  const rows = data.buckets.map((b) => [b.label, String(b.count)]);
  return buildMarkdownTable(headers, rows);
}

function rootCauseToMarkdown(data: RootCauseResult): string {
  const headers = ['Dimension', 'Segment', 'Contribution', 'Relative change'];
  const rows = data.top_segments.map((s) => [
    s.dimension,
    s.segment_value,
    s.contribution_pct.toFixed(2) + '%',
    s.relative_change_pct.toFixed(2) + '%',
  ]);
  return buildMarkdownTable(headers, rows);
}

function funnelGapToMarkdown(data: FunnelGapResult): string {
  const headers = ['Event', 'Relative lift', 'Users with event', 'Users without event'];
  const rows = data.items.map((item) => [
    item.event_name,
    item.relative_lift_pct.toFixed(2) + '%',
    String(item.users_with_event),
    String(item.users_without_event),
  ]);
  return buildMarkdownTable(headers, rows);
}

function segmentCompareToMarkdown(data: SegmentCompareResult): string {
  const headers = ['Segment', 'Value', 'Raw Count', 'Unique Users'];
  const rows: string[][] = [
    [data.segment_a.name, String(data.segment_a.value), String(data.segment_a.raw_count), String(data.segment_a.unique_users)],
    [data.segment_b.name, String(data.segment_b.value), String(data.segment_b.raw_count), String(data.segment_b.unique_users)],
  ];
  return buildMarkdownTable(headers, rows);
}

export function toolResultToMarkdown(parsed: AiToolResultData): string {
  switch (parsed.type) {
    case 'trend_chart':
      return trendToMarkdown(parsed.data);
    case 'funnel_chart':
      return funnelToMarkdown(parsed.data);
    case 'retention_chart':
      return retentionToMarkdown(parsed.data);
    case 'lifecycle_chart':
      return lifecycleToMarkdown(parsed.data);
    case 'stickiness_chart':
      return stickinessToMarkdown(parsed.data);
    case 'paths_chart':
      return pathsToMarkdown(parsed.data);
    case 'segment_compare_chart':
      return segmentCompareToMarkdown(parsed.data);
    case 'histogram_chart':
      return histogramToMarkdown(parsed.data);
    case 'root_cause_chart':
      return rootCauseToMarkdown(parsed.data);
    case 'funnel_gap_chart':
      return funnelGapToMarkdown(parsed.data);
  }
}

// Download helper

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Chart capture helper (html2canvas)

export async function captureChartAsBlob(element: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(element, {
    backgroundColor: '#09090b', // --color-background
    scale: 2,
    useCORS: true,
    logging: false,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('canvas.toBlob returned null'));
      }
    }, 'image/png');
  });
}

export function downloadChartAsPng(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
