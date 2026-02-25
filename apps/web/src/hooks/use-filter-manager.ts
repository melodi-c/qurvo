import { useCallback } from 'react';
import type { StepFilter } from '@/api/generated/Api';

interface HasFilters {
  filters?: StepFilter[];
}

interface FilterManager {
  addFilter: (itemIdx: number) => void;
  updateFilter: (itemIdx: number, filterIdx: number, filter: StepFilter) => void;
  removeFilter: (itemIdx: number, filterIdx: number) => void;
}

export function useFilterManager<T extends HasFilters>(
  items: T[],
  updateItem: (idx: number, patch: Partial<T>) => void,
): FilterManager {
  const addFilter = useCallback(
    (itemIdx: number) => {
      const filters: StepFilter[] = [
        ...(items[itemIdx].filters ?? []),
        { property: '', operator: 'eq', value: '' },
      ];
      updateItem(itemIdx, { filters } as Partial<T>);
    },
    [items, updateItem],
  );

  const updateFilter = useCallback(
    (itemIdx: number, filterIdx: number, filter: StepFilter) => {
      const filters = (items[itemIdx].filters ?? []).map((f, i) =>
        i === filterIdx ? filter : f,
      );
      updateItem(itemIdx, { filters } as Partial<T>);
    },
    [items, updateItem],
  );

  const removeFilter = useCallback(
    (itemIdx: number, filterIdx: number) => {
      const filters = (items[itemIdx].filters ?? []).filter(
        (_, i) => i !== filterIdx,
      );
      updateItem(itemIdx, { filters } as Partial<T>);
    },
    [items, updateItem],
  );

  return { addFilter, updateFilter, removeFilter };
}
