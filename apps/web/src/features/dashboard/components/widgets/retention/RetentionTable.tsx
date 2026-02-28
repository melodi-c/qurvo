import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
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
import { useProjectStore } from '@/stores/project';
import translations from './RetentionTable.translations';
import type { RetentionResult } from '@/api/generated/Api';
import { formatDateWithGranularity } from '@/lib/formatting';

interface RetentionTableProps {
  result: RetentionResult;
  compact?: boolean;
}

function heatmapColor(pct: number): string {
  // Green with varying opacity based on percentage
  const opacity = Math.min(pct / 100, 1) * 0.6;
  return `rgba(34, 197, 94, ${opacity})`;
}

export function RetentionTable({ result, compact = false }: RetentionTableProps) {
  const { cohorts, average_retention, granularity } = result;
  const { t } = useLocalTranslation(translations);
  const timezone = useProjectStore((s) => s.projectTimezone);

  const maxPeriods = compact
    ? Math.min(average_retention.length, 7)
    : average_retention.length;

  const getPeriodLabel = useCallback((granularity: string): string => {
    if (granularity === 'day') {return t('day');}
    if (granularity === 'week') {return t('week');}
    return t('month');
  }, [t]);

  const periodHeaders = useMemo(
    () => Array.from({ length: maxPeriods }, (_, i) => `${getPeriodLabel(granularity)} ${i}`),
    [maxPeriods, granularity, getPeriodLabel],
  );

  const firstColRef = useRef<HTMLTableCellElement>(null);
  const [secondColLeft, setSecondColLeft] = useState(0);

  useEffect(() => {
    const el = firstColRef.current;
    if (!el) {return;}

    setSecondColLeft(el.offsetWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSecondColLeft(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (cohorts.length === 0) {return null;}

  const secondColStyle = { left: secondColLeft } as React.CSSProperties;

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead ref={firstColRef} className="sticky left-0 bg-background z-20">{t('cohort')}</TableHead>
          <TableHead className="sticky bg-background z-20 text-right" style={secondColStyle}>{t('users')}</TableHead>
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
          <TableCell className="sticky bg-background z-10" style={secondColStyle} />
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
                {formatDateWithGranularity(cohort.cohort_date, granularity, timezone)}
              </TableCell>
              <TableCell className="sticky bg-background z-10 text-right text-xs tabular-nums" style={secondColStyle}>
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

                if (compact) {return cell;}

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
