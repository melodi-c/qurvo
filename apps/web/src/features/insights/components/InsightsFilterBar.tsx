import { useState, useEffect } from 'react';
import { Search, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
import { useDebounce } from '@/hooks/use-debounce';
import type { InsightsFilters, InsightTypeFilter, InsightSortOrder } from '../hooks/use-insights-filters';

const TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: 'All',        value: 'all' },
  { label: 'Trends',     value: 'trend' },
  { label: 'Funnels',    value: 'funnel' },
  { label: 'Retention',  value: 'retention' },
  { label: 'Lifecycle',  value: 'lifecycle' },
  { label: 'Stickiness', value: 'stickiness' },
];

interface InsightsFilterBarProps {
  filters: InsightsFilters;
  setFilter: (partial: Partial<InsightsFilters>) => void;
}

export function InsightsFilterBar({ filters, setFilter }: InsightsFilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, 300);

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
          placeholder="Search insights…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-8 h-8 w-52 text-sm"
        />
      </div>

      <PillToggleGroup
        options={TYPE_OPTIONS}
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
        Favorites
      </Button>

      <Select
        value={filters.sort}
        onValueChange={(value) => setFilter({ sort: value as InsightSortOrder })}
      >
        <SelectTrigger size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="oldest">Oldest first</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
