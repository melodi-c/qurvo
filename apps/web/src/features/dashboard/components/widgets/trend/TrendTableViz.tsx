import { useMemo, useState, useCallback } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { TrendSeriesResult, TrendGranularity } from '@/api/generated/Api';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatBucket, formatCompactNumber } from '@/lib/formatting';
import { CHART_COLORS_HEX, STATUS_COLORS } from '@/lib/chart-colors';
import { buildDataPoints, seriesKey, type DateRangeParams } from './trend-utils';
import { TruncatedText } from './TruncatedText';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useProjectStore } from '@/stores/project';
import translations from './TrendTableViz.translations';

interface TrendTableVizProps {
  series: TrendSeriesResult[];
  previousSeries?: TrendSeriesResult[];
  granularity?: TrendGranularity;
  compact?: boolean;
  /** Date range for generating full X axis bucket set */
  dateFrom?: string;
  dateTo?: string;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string;
  direction: SortDirection;
}

/** Format a number with locale-aware thousands separators. */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Compute percentage delta between current and previous values. */
function computeDelta(current: number, previous: number): { percent: number; direction: 'up' | 'down' | 'neutral' } {
  if (previous === 0 && current === 0) {return { percent: 0, direction: 'neutral' };}
  if (previous === 0) {return { percent: 100, direction: 'up' };}
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  if (percent > 0) {return { percent, direction: 'up' };}
  if (percent < 0) {return { percent: Math.abs(percent), direction: 'down' };}
  return { percent: 0, direction: 'neutral' };
}

function DeltaCell({ current, previous }: { current: number; previous: number }) {
  const delta = computeDelta(current, previous);
  if (delta.direction === 'neutral') {
    return <span className="text-muted-foreground">0%</span>;
  }
  const colorClass = delta.direction === 'up' ? STATUS_COLORS.positive : STATUS_COLORS.negative;
  const Icon = delta.direction === 'up' ? ArrowUp : ArrowDown;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium', colorClass)}>
      <Icon size={12} />
      {delta.percent.toFixed(1)}%
    </span>
  );
}

function SortIcon({ direction }: { direction: SortDirection }) {
  if (direction === 'asc') {return <ArrowUp size={12} className="inline ml-0.5" />;}
  if (direction === 'desc') {return <ArrowDown size={12} className="inline ml-0.5" />;}
  return <ArrowUpDown size={12} className="inline ml-0.5 opacity-40" />;
}

/** Maximum rows shown in compact (dashboard widget) mode. */
const COMPACT_MAX_ROWS = 8;

export function TrendTableViz({ series, previousSeries, granularity, compact, dateFrom, dateTo }: TrendTableVizProps) {
  const { t } = useLocalTranslation(translations);
  const timezone = useProjectStore((s) => s.projectTimezone);
  const showCompare = !!previousSeries && previousSeries.length > 0;

  const [sort, setSort] = useState<SortState>({ column: 'bucket', direction: null });

  const allSeriesKeys = useMemo(() => series.map((s) => seriesKey(s)), [series]);

  const dateRange: DateRangeParams | undefined = dateFrom && dateTo && granularity
    ? { dateFrom, dateTo, granularity, timezone }
    : undefined;
  const data = useMemo(
    () => buildDataPoints(series, previousSeries, dateRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, previousSeries, dateFrom, dateTo, granularity],
  );

  const prevKeys = useMemo(
    () => (previousSeries ?? []).map((s) => `prev_${seriesKey(s)}`),
    [previousSeries],
  );

  /** Totals row — sum of each series column. */
  const totals = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const key of allSeriesKeys) {sums[key] = 0;}
    for (const key of prevKeys) {sums[key] = 0;}
    for (const point of data) {
      for (const key of allSeriesKeys) {sums[key] += (point[key] as number) ?? 0;}
      for (const key of prevKeys) {sums[key] += (point[key] as number) ?? 0;}
    }
    return sums;
  }, [data, allSeriesKeys, prevKeys]);

  const toggleSort = useCallback((column: string) => {
    setSort((prev) => {
      if (prev.column !== column) {return { column, direction: 'desc' };}
      if (prev.direction === 'desc') {return { column, direction: 'asc' };}
      if (prev.direction === 'asc') {return { column, direction: null };}
      return { column, direction: 'desc' };
    });
  }, []);

  const handleSortKeyDown = useCallback(
    (column: string) => (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSort(column);
      }
    },
    [toggleSort],
  );

  function ariaSort(column: string): 'ascending' | 'descending' | 'none' {
    if (sort.column !== column || !sort.direction) {return 'none';}
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  const sortedData = useMemo(() => {
    if (!sort.direction) {return data;}
    const sorted = [...data].sort((a, b) => {
      const aVal = sort.column === 'bucket' ? (a.bucket as string) : (a[sort.column] as number) ?? 0;
      const bVal = sort.column === 'bucket' ? (b.bucket as string) : (b[sort.column] as number) ?? 0;
      if (aVal < bVal) {return sort.direction === 'asc' ? -1 : 1;}
      if (aVal > bVal) {return sort.direction === 'asc' ? 1 : -1;}
      return 0;
    });
    return sorted;
  }, [data, sort]);

  const displayData = compact ? sortedData.slice(0, COMPACT_MAX_ROWS) : sortedData;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t('noData')}
      </div>
    );
  }

  const cellPadding = compact ? 'px-1.5 py-1' : 'px-2 py-1.5';
  const fontSize = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={cn('w-full', compact ? 'overflow-auto h-full' : '')}>
      <Table className={fontSize}>
        <TableHeader>
          <TableRow>
            <TableHead
              className={cn('cursor-pointer select-none', cellPadding)}
              tabIndex={0}
              aria-sort={ariaSort('bucket')}
              onClick={() => toggleSort('bucket')}
              onKeyDown={handleSortKeyDown('bucket')}
            >
              {t('date')}
              <SortIcon direction={sort.column === 'bucket' ? sort.direction : null} />
            </TableHead>
            {allSeriesKeys.map((key, idx) => (
              <TableHead
                key={key}
                className={cn('cursor-pointer select-none text-right', cellPadding)}
                tabIndex={0}
                aria-sort={ariaSort(key)}
                onClick={() => toggleSort(key)}
                onKeyDown={handleSortKeyDown(key)}
              >
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: CHART_COLORS_HEX[idx % CHART_COLORS_HEX.length] }}
                  />
                  <TruncatedText text={key} className="truncate max-w-[120px]" />
                  <SortIcon direction={sort.column === key ? sort.direction : null} />
                </span>
              </TableHead>
            ))}
            {showCompare && allSeriesKeys.map((key) => (
              <TableHead
                key={`delta_${key}`}
                className={cn('text-right', cellPadding)}
              >
                {t('delta')}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayData.map((point) => {
            const bucket = point.bucket as string;
            return (
              <TableRow key={bucket}>
                <TableCell className={cn('font-medium text-muted-foreground', cellPadding)}>
                  {formatBucket(bucket, granularity ?? 'day', compact, timezone)}
                </TableCell>
                {allSeriesKeys.map((key) => {
                  const value = (point[key] as number) ?? 0;
                  return (
                    <TableCell key={key} className={cn('text-right tabular-nums', cellPadding)}>
                      {compact ? formatCompactNumber(value) : formatNumber(value)}
                    </TableCell>
                  );
                })}
                {showCompare && allSeriesKeys.map((key, idx) => {
                  const current = (point[key] as number) ?? 0;
                  const prevKey = prevKeys[idx];
                  const previous = prevKey ? (point[prevKey] as number) ?? 0 : 0;
                  return (
                    <TableCell key={`delta_${key}`} className={cn('text-right', cellPadding)}>
                      <DeltaCell current={current} previous={previous} />
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          {/* Totals row */}
          <TableRow className="font-medium border-t-2">
            <TableCell className={cn('text-muted-foreground', cellPadding)}>
              {t('total')}
            </TableCell>
            {allSeriesKeys.map((key) => (
              <TableCell key={key} className={cn('text-right tabular-nums', cellPadding)}>
                {compact ? formatCompactNumber(totals[key]) : formatNumber(totals[key])}
              </TableCell>
            ))}
            {showCompare && allSeriesKeys.map((key, idx) => {
              const prevKey = prevKeys[idx];
              return (
                <TableCell key={`delta_${key}`} className={cn('text-right', cellPadding)}>
                  <DeltaCell current={totals[key]} previous={prevKey ? totals[prevKey] : 0} />
                </TableCell>
              );
            })}
          </TableRow>
        </TableBody>
      </Table>
      {compact && sortedData.length > COMPACT_MAX_ROWS && (
        <div className="text-center text-xs text-muted-foreground py-1">
          +{sortedData.length - COMPACT_MAX_ROWS}
        </div>
      )}
    </div>
  );
}
