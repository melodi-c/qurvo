import { useCallback, useRef } from 'react';
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
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const updateItemRef = useRef(updateItem);
  updateItemRef.current = updateItem;

  const addFilter = useCallback(
    (itemIdx: number) => {
      const current = itemsRef.current[itemIdx];
      const filters: StepFilter[] = [
        ...(current.filters ?? []),
        { property: '', operator: 'eq', value: '' },
      ];
      updateItemRef.current(itemIdx, { filters } as Partial<T>);
    },
    [],
  );

  const updateFilter = useCallback(
    (itemIdx: number, filterIdx: number, filter: StepFilter) => {
      const current = itemsRef.current[itemIdx];
      const filters = (current.filters ?? []).map((f, i) =>
        i === filterIdx ? filter : f,
      );
      updateItemRef.current(itemIdx, { filters } as Partial<T>);
    },
    [],
  );

  const removeFilter = useCallback(
    (itemIdx: number, filterIdx: number) => {
      const current = itemsRef.current[itemIdx];
      const filters = (current.filters ?? []).filter(
        (_, i) => i !== filterIdx,
      );
      updateItemRef.current(itemIdx, { filters } as Partial<T>);
    },
    [],
  );

  return { addFilter, updateFilter, removeFilter };
}
