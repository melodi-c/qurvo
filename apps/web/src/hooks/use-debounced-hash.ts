import { useMemo } from 'react';
import { useDebounce } from '@/hooks/use-debounce';

export function useDebouncedHash<T>(value: T, delay: number): { debounced: T; hash: string } {
  const debounced = useDebounce(value, delay);
  const hash = useMemo(() => JSON.stringify(debounced), [debounced]);
  return { debounced, hash };
}
