import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { useDashboardStore } from '../store';
import { hasActiveOverrides } from '../lib/filter-overrides';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './DashboardFilterBar.translations';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export function DashboardFilterBar() {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const filterOverrides = useDashboardStore((s) => s.filterOverrides);
  const setFilterOverrides = useDashboardStore((s) => s.setFilterOverrides);
  const clearFilterOverrides = useDashboardStore((s) => s.clearFilterOverrides);
  const { t } = useLocalTranslation(translations);

  const hasOverrides = hasActiveOverrides(filterOverrides);

  // View mode with active overrides — compact banner
  if (!isEditing && hasOverrides) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
        <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-muted-foreground flex-1">
          {t('overrideBanner')}: {filterOverrides.dateFrom} — {filterOverrides.dateTo}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={clearFilterOverrides}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Not editing and no overrides — hide
  if (!isEditing) return null;

  // Edit mode — full filter bar
  return (
    <div className="border border-border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('dashboardFilters')}
        </span>
        {hasOverrides && (
          <Button variant="ghost" size="xs" onClick={clearFilterOverrides}>
            {t('discardOverrides')}
          </Button>
        )}
      </div>
      <DateRangeSection
        dateFrom={filterOverrides.dateFrom ?? defaultDateFrom()}
        dateTo={filterOverrides.dateTo ?? todayStr()}
        onChange={(from, to) => setFilterOverrides({ dateFrom: from, dateTo: to })}
      />
    </div>
  );
}
