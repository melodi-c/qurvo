import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import type { TrendSeriesResult } from '@/api/generated/Api';
import { cn } from '@/lib/utils';
import { CHART_COLORS_HSL, CHART_FORMULA_COLORS_HSL } from '@/lib/chart-colors';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './LegendTable.translations';

const COLORS = CHART_COLORS_HSL;
const FORMULA_COLORS = CHART_FORMULA_COLORS_HSL;

interface LegendTableProps {
  allSeriesKeys: string[];
  formulaKeys: string[];
  seriesTotals: number[];
  formulaTotals: (number | null)[];
  hiddenKeys: Set<string>;
  onToggleSeries: (key: string) => void;
  previousSeries?: TrendSeriesResult[];
}

export function LegendTable({
  allSeriesKeys,
  formulaKeys,
  seriesTotals,
  formulaTotals,
  hiddenKeys,
  onToggleSeries,
  previousSeries,
}: LegendTableProps) {
  const { t } = useLocalTranslation(translations);
  const hasPrevious = previousSeries && previousSeries.length > 0;

  return (
    <div className="mt-4 border-t border-border/40">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b-0">
            <TableHead className="h-8 text-muted-foreground/60 text-xs font-medium">{t('series')}</TableHead>
            <TableHead className="h-8 text-muted-foreground/60 text-xs font-medium text-right w-28">{t('total')}</TableHead>
            {hasPrevious && (
              <TableHead className="h-8 text-muted-foreground/60 text-xs font-medium text-right w-28">{t('previous')}</TableHead>
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
                className={cn('cursor-pointer', isHidden && 'opacity-35')}
                onClick={() => onToggleSeries(key)}
              >
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: isHidden ? 'var(--color-muted-foreground)' : color }}
                    />
                    <span className={cn('truncate', isHidden ? 'line-through text-muted-foreground' : 'text-foreground')}>
                      {key}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums font-medium text-foreground">
                  {total.toLocaleString()}
                </TableCell>
                {hasPrevious && (
                  <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {prevTotal !== undefined ? prevTotal.toLocaleString() : '\u2014'}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {formulaKeys.map((key, idx) => {
            const isHidden = hiddenKeys.has(key);
            const total = formulaTotals[idx] ?? null;
            const color = FORMULA_COLORS[idx % FORMULA_COLORS.length];

            const totalDisplay =
              total === null
                ? '\u2014'
                : Number.isInteger(total)
                  ? total.toLocaleString()
                  : total.toLocaleString(undefined, { maximumFractionDigits: 2 });

            return (
              <TableRow
                key={key}
                className={cn('cursor-pointer', isHidden && 'opacity-35')}
                onClick={() => onToggleSeries(key)}
              >
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0 border border-dashed"
                      style={{ borderColor: isHidden ? 'var(--color-muted-foreground)' : color }}
                    />
                    <span className={cn('truncate', isHidden ? 'line-through text-muted-foreground' : 'text-foreground')}>
                      {key}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums font-medium text-foreground">
                  {totalDisplay}
                </TableCell>
                {hasPrevious && (
                  <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {'\u2014'}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
