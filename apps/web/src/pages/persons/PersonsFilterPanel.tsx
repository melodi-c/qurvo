import { Search, Filter, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from '@/components/ui/section-header';
import { StepFilterRow } from '@/features/dashboard/components/widgets/funnel/StepFilterRow';
import { usePersonPropertyNames } from './use-person-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './PersonsFilterPanel.translations';
import type { StepFilter } from '@/api/generated/Api';

interface PersonsFilterPanelProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: StepFilter[];
  onFiltersChange: (filters: StepFilter[]) => void;
}

export function PersonsFilterPanel({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
}: PersonsFilterPanelProps) {
  const { t } = useLocalTranslation(translations);
  const { data: propertyNames = [] } = usePersonPropertyNames();

  const addFilter = () =>
    onFiltersChange([...filters, { property: '', operator: 'eq', value: '' }]);

  const updateFilter = (i: number, f: StepFilter) =>
    onFiltersChange(filters.map((existing, idx) => (idx === i ? f : existing)));

  const removeFilter = (i: number) =>
    onFiltersChange(filters.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <section className="space-y-2">
        <SectionHeader icon={Search} label={t('identifier')} />
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 text-sm"
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <SectionHeader icon={Filter} label={t('propertyFilters')} />
        {filters.length > 0 && (
          <div className="space-y-2">
            {filters.map((f, i) => (
              <StepFilterRow
                key={i}
                filter={f}
                onChange={(updated) => updateFilter(i, updated)}
                onRemove={() => removeFilter(i)}
                propertyNames={propertyNames}
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
