import type {
  TrendSeriesResult,
  FunnelStepResult,
  RetentionResult,
  LifecycleResult,
  StickinessResult,
  PathsResult,
} from '@/api/generated/Api';

/** Escape a CSV cell value: wrap in quotes if it contains comma, quote, or newline. */
function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

/**
 * trend: bucket + value per series
 * Columns: bucket, <series_label_1>, <series_label_2>, ...
 */
export function trendToCsv(series: TrendSeriesResult[]): string {
  if (series.length === 0) {return '';}

  // Collect all unique buckets in order
  const buckets = series[0].data.map((dp) => dp.bucket);

  const header = buildCsvRow(['bucket', ...series.map((s) => s.label || s.event_name)]);

  const rows = buckets.map((bucket, idx) => {
    const cells: (string | number)[] = [bucket];
    for (const s of series) {
      cells.push(s.data[idx]?.value ?? 0);
    }
    return buildCsvRow(cells);
  });

  return [header, ...rows].join('\n');
}

/**
 * funnel: step + event_name + count + conversion_rate + drop_off + avg_time_to_convert_seconds
 */
export function funnelToCsv(steps: FunnelStepResult[]): string {
  if (steps.length === 0) {return '';}

  const header = buildCsvRow([
    'step',
    'label',
    'event_name',
    'count',
    'conversion_rate',
    'drop_off',
    'drop_off_rate',
    'avg_time_to_convert_seconds',
  ]);

  const rows = steps.map((s) =>
    buildCsvRow([
      s.step,
      s.label,
      s.event_name,
      s.count,
      s.conversion_rate,
      s.drop_off,
      s.drop_off_rate,
      s.avg_time_to_convert_seconds ?? '',
    ]),
  );

  return [header, ...rows].join('\n');
}

/**
 * retention: cohort_date + cohort_size + period_0 + period_1 + ... matrix
 */
export function retentionToCsv(result: RetentionResult): string {
  const { cohorts } = result;
  if (cohorts.length === 0) {return '';}

  const maxPeriods = Math.max(...cohorts.map((c) => c.periods.length));
  const periodHeaders = Array.from({ length: maxPeriods }, (_, i) => `period_${i}`);

  const header = buildCsvRow(['cohort_date', 'cohort_size', ...periodHeaders]);

  const rows = cohorts.map((c) => {
    const periodCells = Array.from({ length: maxPeriods }, (_, i) =>
      c.periods[i] != null ? c.periods[i] : '',
    );
    return buildCsvRow([c.cohort_date, c.cohort_size, ...periodCells]);
  });

  return [header, ...rows].join('\n');
}

/**
 * lifecycle: bucket + new + returning + resurrecting + dormant
 */
export function lifecycleToCsv(data: LifecycleResult): string {
  if (data.data.length === 0) {return '';}

  const header = buildCsvRow(['bucket', 'new', 'returning', 'resurrecting', 'dormant']);

  const rows = data.data.map((dp) =>
    buildCsvRow([dp.bucket, dp.new, dp.returning, dp.resurrecting, dp.dormant]),
  );

  return [header, ...rows].join('\n');
}

/**
 * stickiness: period_count + user_count
 */
export function stickinessToCsv(data: StickinessResult): string {
  if (data.data.length === 0) {return '';}

  const header = buildCsvRow(['period_count', 'user_count']);

  const rows = data.data.map((dp) => buildCsvRow([dp.period_count, dp.user_count]));

  return [header, ...rows].join('\n');
}

/**
 * paths: step + source + target + person_count (transitions table)
 */
export function pathsToCsv(data: PathsResult): string {
  if (data.transitions.length === 0) {return '';}

  const header = buildCsvRow(['step', 'source', 'target', 'person_count']);

  const rows = data.transitions.map((tr) =>
    buildCsvRow([tr.step, tr.source, tr.target, tr.person_count]),
  );

  return [header, ...rows].join('\n');
}

/**
 * Creates a temporary Blob URL and triggers browser download.
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
