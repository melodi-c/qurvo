import { useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './RetentionTable.translations';
import type { RetentionResult } from '@/api/generated/Api';

interface RetentionTableProps {
  result: RetentionResult;
  compact?: boolean;
}

function heatmapColor(pct: number): string {
  // Green with varying opacity based on percentage
  const opacity = Math.min(pct / 100, 1) * 0.6;
  return `rgba(34, 197, 94, ${opacity})`;
}

function formatDate(dateStr: string, granularity: string): string {
  const d = new Date(dateStr);
  if (granularity === 'month') {
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function RetentionTable({ result, compact = false }: RetentionTableProps) {
  const { cohorts, average_retention, granularity } = result;
  const { t } = useLocalTranslation(translations);

  const maxPeriods = compact
    ? Math.min(average_retention.length, 7)
    : average_retention.length;

  const getPeriodLabel = useCallback((granularity: string): string => {
    if (granularity === 'day') return t('day');
    if (granularity === 'week') return t('week');
    return t('month');
  }, [t]);

  const periodHeaders = useMemo(
    () => Array.from({ length: maxPeriods }, (_, i) => `${getPeriodLabel(granularity)} ${i}`),
    [maxPeriods, granularity, getPeriodLabel],
  );

  if (cohorts.length === 0) return null;

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background z-10 min-w-[100px]">{t('cohort')}</TableHead>
            <TableHead className="text-right min-w-[60px]">{t('users')}</TableHead>
            {periodHeaders.map((h) => (
              <TableHead key={h} className="text-center min-w-[70px] text-xs">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Average row */}
          <TableRow className="border-b-2 border-border font-medium">
            <TableCell className="sticky left-0 bg-background z-10 text-xs text-muted-foreground">
              {t('average')}
            </TableCell>
            <TableCell />
            {average_retention.slice(0, maxPeriods).map((pct, i) => (
              <TableCell
                key={i}
                className="text-center text-xs"
                style={{ backgroundColor: heatmapColor(pct) }}
              >
                {pct.toFixed(1)}%
              </TableCell>
            ))}
          </TableRow>

          {/* Cohort rows */}
          {cohorts.map((cohort) => {
            const periods = cohort.periods.slice(0, maxPeriods);
            return (
              <TableRow key={cohort.cohort_date}>
                <TableCell className="sticky left-0 bg-background z-10 text-xs font-mono whitespace-nowrap">
                  {formatDate(cohort.cohort_date, granularity)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {cohort.cohort_size.toLocaleString()}
                </TableCell>
                {periods.map((count, i) => {
                  const pct = cohort.cohort_size > 0 ? (count / cohort.cohort_size) * 100 : 0;
                  const cell = (
                    <TableCell
                      key={i}
                      className="text-center text-xs tabular-nums"
                      style={{ backgroundColor: heatmapColor(pct) }}
                    >
                      {pct.toFixed(1)}%
                    </TableCell>
                  );

                  if (compact) return cell;

                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>{cell}</TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{t('usersCount', { count: count.toLocaleString(), pct: pct.toFixed(1) })}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
