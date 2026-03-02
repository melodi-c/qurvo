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

/**
 * Manages per-item filters using a functional updater to avoid stale closures.
 *
 * `onChangeAll` must accept `(prev: T[]) => T[]` so that rapid-fire calls
 * (e.g. addSeries followed by addFilter before a re-render) always operate
 * on the latest pending state rather than a captured snapshot.
 */
export function useFilterManager<T extends HasFilters>(
  onChangeAll: (updater: (prev: T[]) => T[]) => void,
): FilterManager {
  const addFilter = useCallback(
    (itemIdx: number) => {
      onChangeAll((prev) =>
        prev.map((item, i) => {
          if (i !== itemIdx) {return item;}
          const filters: StepFilter[] = [
            ...(item.filters ?? []),
            { property: '', operator: 'eq', value: '' },
          ];
          return { ...item, filters };
        }),
      );
    },
    [onChangeAll],
  );

  const updateFilter = useCallback(
    (itemIdx: number, filterIdx: number, filter: StepFilter) => {
      onChangeAll((prev) =>
        prev.map((item, i) => {
          if (i !== itemIdx) {return item;}
          const filters = (item.filters ?? []).map((f, fi) =>
            fi === filterIdx ? filter : f,
          );
          return { ...item, filters };
        }),
      );
    },
    [onChangeAll],
  );

  const removeFilter = useCallback(
    (itemIdx: number, filterIdx: number) => {
      onChangeAll((prev) =>
        prev.map((item, i) => {
          if (i !== itemIdx) {return item;}
          const filters = (item.filters ?? []).filter(
            (_, fi) => fi !== filterIdx,
          );
          return { ...item, filters };
        }),
      );
    },
    [onChangeAll],
  );

  return { addFilter, updateFilter, removeFilter };
}
