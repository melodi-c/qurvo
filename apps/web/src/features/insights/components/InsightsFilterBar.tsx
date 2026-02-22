import { useState, useEffect, useMemo } from 'react';
import { Search, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { useDebounce } from '@/hooks/use-debounce';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './InsightsFilterBar.translations';
import type { InsightsFilters, InsightTypeFilter, InsightSortOrder } from '../hooks/use-insights-filters';

interface InsightsFilterBarProps {
  filters: InsightsFilters;
  setFilter: (partial: Partial<InsightsFilters>) => void;
}

export function InsightsFilterBar({ filters, setFilter }: InsightsFilterBarProps) {
  const { t } = useLocalTranslation(translations);
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const typeOptions = useMemo(() => [
    { label: t('all'),        value: 'all' },
    { label: t('trends'),     value: 'trend' },
    { label: t('funnels'),    value: 'funnel' },
    { label: t('retention'),  value: 'retention' },
    { label: t('lifecycle'),  value: 'lifecycle' },
    { label: t('stickiness'), value: 'stickiness' },
  ], [t]);

  useEffect(() => {
    setFilter({ search: debouncedSearch });
  }, [debouncedSearch, setFilter]);

  // Sync if URL changes externally (e.g. browser back)
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={t('searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-8 h-8 w-52 text-sm"
        />
      </div>

      <PillToggleGroup
        options={typeOptions}
        value={filters.type}
        onChange={(value) => setFilter({ type: value as InsightTypeFilter })}
      />

      <div className="flex-1" />

      <Button
        variant={filters.favorites ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => setFilter({ favorites: !filters.favorites })}
        className="h-8 gap-1.5"
      >
        <Star className={cn('h-3.5 w-3.5', filters.favorites && 'fill-current')} />
        {t('favorites')}
      </Button>

      <Select
        value={filters.sort}
        onValueChange={(value) => setFilter({ sort: value as InsightSortOrder })}
      >
        <SelectTrigger size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">{t('newestFirst')}</SelectItem>
          <SelectItem value="oldest">{t('oldestFirst')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
