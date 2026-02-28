import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { InsightType } from '@/api/generated/Api';

export type InsightTypeFilter = InsightType | 'all';
export type InsightSortOrder = 'newest' | 'oldest';

const VALID_TYPE_FILTERS: readonly InsightTypeFilter[] = [
  'all', 'trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths',
] as const;

const VALID_SORT_ORDERS: readonly InsightSortOrder[] = ['newest', 'oldest'] as const;

export interface InsightsFilters {
  search: string;
  type: InsightTypeFilter;
  sort: InsightSortOrder;
  favorites: boolean;
}

export function useInsightsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawType = searchParams.get('type');
  const rawSort = searchParams.get('sort');

  const filters: InsightsFilters = {
    search: searchParams.get('search') ?? '',
    type: rawType !== null && (VALID_TYPE_FILTERS as readonly string[]).includes(rawType)
      ? (rawType as InsightTypeFilter)
      : 'all',
    sort: rawSort !== null && (VALID_SORT_ORDERS as readonly string[]).includes(rawSort)
      ? (rawSort as InsightSortOrder)
      : 'newest',
    favorites: searchParams.get('favorites') === '1',
  };

  const setFilter = useCallback(
    (partial: Partial<InsightsFilters>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if ('search' in partial) {
          if (partial.search) next.set('search', partial.search);
          else next.delete('search');
        }
        if ('type' in partial) {
          if (partial.type && partial.type !== 'all') next.set('type', partial.type);
          else next.delete('type');
        }
        if ('sort' in partial) {
          if (partial.sort && partial.sort !== 'newest') next.set('sort', partial.sort);
          else next.delete('sort');
        }
        if ('favorites' in partial) {
          if (partial.favorites) next.set('favorites', '1');
          else next.delete('favorites');
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  return { filters, setFilter };
}
