import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useUrlTab<T extends string>(
  defaultTab: T,
  validTabs?: readonly T[],
): [T, (tab: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');

  const activeTab: T =
    raw !== null && (!validTabs || (validTabs as readonly string[]).includes(raw))
      ? (raw as T)
      : defaultTab;

  const setTab = useCallback(
    (tab: T) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      });
    },
    [setSearchParams],
  );

  return [activeTab, setTab];
}
