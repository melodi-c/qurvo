import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from '@/components/ui/section-header';
import { FilterListSection } from '@/components/FilterListSection';
import { usePersonPropertyNames } from '@/hooks/use-person-property-names';
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

      <FilterListSection
        label={t('propertyFilters')}
        addLabel={t('addFilter')}
        filters={filters}
        onFiltersChange={onFiltersChange}
        propertyNames={propertyNames}
      />
    </div>
  );
}
