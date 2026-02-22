import { CalendarDays, Filter, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from '@/components/ui/section-header';
import { DateRangeSection } from '@/components/ui/date-range-section';
import { StepFilterRow } from '@/features/dashboard/components/widgets/funnel/StepFilterRow';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useDashboardStore } from '../store';
import { hasActiveOverrides } from '../lib/filter-overrides';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './DashboardFilterBar.translations';
import type { StepFilter } from '@/api/generated/Api';

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
    if (hasDateOverride) parts.push(`${filterOverrides.dateFrom} — ${filterOverrides.dateTo}`);
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
  if (!isEditing) return null;

  const addFilter = () =>
    setPropertyFilters([...filterOverrides.propertyFilters, { property: '', operator: 'eq', value: '' }]);

  const updateFilter = (i: number, f: StepFilter) =>
    setPropertyFilters(filterOverrides.propertyFilters.map((existing, idx) => (idx === i ? f : existing)));

  const removeFilter = (i: number) =>
    setPropertyFilters(filterOverrides.propertyFilters.filter((_, idx) => idx !== i));

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
        dateFrom={filterOverrides.dateFrom ?? defaultDateFrom()}
        dateTo={filterOverrides.dateTo ?? todayStr()}
        onChange={(from, to) => setFilterOverrides({ dateFrom: from, dateTo: to })}
      />

      <Separator />

      {/* Property filters */}
      <section className="space-y-2">
        <SectionHeader icon={Filter} label={t('propertyFilters')} />
        {filterOverrides.propertyFilters.length > 0 && (
          <div className="space-y-2">
            {filterOverrides.propertyFilters.map((f, i) => (
              <StepFilterRow
                key={i}
                filter={f}
                onChange={(updated) => updateFilter(i, updated)}
                onRemove={() => removeFilter(i)}
                propertyNames={propertyNames}
                propertyDescriptions={propDescriptions}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addFilter}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('addFilter')}
        </button>
      </section>
    </div>
  );
}
