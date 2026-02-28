import { CalendarDays, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { FilterListSection } from '@/components/FilterListSection';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useDashboardStore } from '../store';
import { hasActiveOverrides } from '../lib/filter-overrides';
import { todayIso, daysAgoIso } from '@/lib/date-utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './DashboardFilterBar.translations';
import { formatDate } from '@/lib/formatting';

export function DashboardFilterBar() {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const filterOverrides = useDashboardStore((s) => s.filterOverrides);
  const setFilterOverrides = useDashboardStore((s) => s.setFilterOverrides);
  const setPropertyFilters = useDashboardStore((s) => s.setPropertyFilters);
  const clearFilterOverrides = useDashboardStore((s) => s.clearFilterOverrides);
  const { t } = useLocalTranslation(translations);
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames();

  const hasOverrides = hasActiveOverrides(filterOverrides);
  const hasDateOverride = !!(filterOverrides.dateFrom || filterOverrides.dateTo);
  const hasPropertyOverrides = filterOverrides.propertyFilters.length > 0;

  // View mode with active overrides — compact banner
  if (!isEditing && hasOverrides) {
    const parts: string[] = [];
    if (hasDateOverride) {
      const from = filterOverrides.dateFrom ? formatDate(filterOverrides.dateFrom) : '';
      const to = filterOverrides.dateTo ? formatDate(filterOverrides.dateTo) : '';
      parts.push(`${from} — ${to}`);
    }
    if (hasPropertyOverrides) {
      parts.push(
        filterOverrides.propertyFilters
          .map((f) => `${f.property} ${f.operator} ${f.value ?? ''}`.trim())
          .join(', '),
      );
    }

    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
        {hasDateOverride && <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />}
        {hasPropertyOverrides && <Filter className="h-4 w-4 text-primary flex-shrink-0" />}
        <span className="text-muted-foreground flex-1 truncate">{parts.join(' · ')}</span>
        <Button variant="ghost" size="icon-xs" onClick={clearFilterOverrides}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Not editing and no overrides — hide
  if (!isEditing) {return null;}

  // Edit mode — full filter bar
  return (
    <div className="border border-border rounded-lg p-3 bg-card space-y-3">
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
        dateFrom={filterOverrides.dateFrom ?? daysAgoIso(30)}
        dateTo={filterOverrides.dateTo ?? todayIso()}
        onChange={(from, to) => setFilterOverrides({ dateFrom: from, dateTo: to })}
      />

      <Separator />

      <FilterListSection
        label={t('propertyFilters')}
        addLabel={t('addFilter')}
        filters={filterOverrides.propertyFilters}
        onFiltersChange={setPropertyFilters}
        propertyNames={propertyNames}
        propertyDescriptions={propDescriptions}
      />
    </div>
  );
}
