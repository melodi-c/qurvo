import { CalendarDays } from 'lucide-react';
import { format, parse } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePresetButtons } from '@/components/ui/date-preset-buttons';
import { SectionHeader } from '@/components/ui/section-header';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveRelativeDate, isRelativeDate, getActivePreset, getPresetLabelKey } from '@/lib/date-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './date-range-section.translations';

interface DateRangeSectionProps {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
}

function formatAbsoluteDate(iso: string): string {
  try {
    return format(parse(iso, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

export function DateRangeSection({ dateFrom, dateTo, onChange }: DateRangeSectionProps) {
  const { t } = useLocalTranslation(translations);

  // Resolve relative dates for display in the date picker
  const resolvedFrom = resolveRelativeDate(dateFrom);
  const resolvedTo = resolveRelativeDate(dateTo);

  // Check if a known preset is active
  const activePreset = getActivePreset(dateFrom, dateTo);
  const presetLabelKey = activePreset ? getPresetLabelKey(dateFrom) : undefined;

  return (
    <section className="space-y-3">
      <SectionHeader icon={CalendarDays} label={t('dateRange')} />
      <DatePresetButtons dateFrom={dateFrom} dateTo={dateTo} onChange={onChange} />

      {presetLabelKey ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-transparent px-3 text-sm text-foreground transition-colors hover:border-primary/40"
              onClick={() => {
                // Clicking resolves to absolute dates so the user can manually adjust
                onChange(resolvedFrom, resolvedTo);
              }}
            >
              <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
              <span>{t(presetLabelKey)}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {formatAbsoluteDate(resolvedFrom)} – {formatAbsoluteDate(resolvedTo)}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">{t('from')}</span>
            <DatePicker
              value={resolvedFrom}
              onChange={(v) => {
                // Manual date picker selection stores absolute dates
                onChange(v, isRelativeDate(dateTo) ? resolveRelativeDate(dateTo) : dateTo);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">{t('to')}</span>
            <DatePicker
              value={resolvedTo}
              onChange={(v) => {
                // Manual date picker selection stores absolute dates
                onChange(isRelativeDate(dateFrom) ? resolveRelativeDate(dateFrom) : dateFrom, v);
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
