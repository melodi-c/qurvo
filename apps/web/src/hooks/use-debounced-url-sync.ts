import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Debounces URL search-param updates whenever `state` changes.
 *
 * Skips the initial mount so that reading the URL on first render does not
 * immediately overwrite it.  After `delay` ms of inactivity the `serialize`
 * function is called with the current state and the existing URLSearchParams,
 * and the return value is committed with `replace: true`.
 */
export function useDebouncedUrlSync<T>(
  state: T,
  serialize: (state: T, prev: URLSearchParams) => URLSearchParams,
  delay: number,
): void {
  const [, setSearchParams] = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSearchParams((prev) => serialize(state, prev), { replace: true });
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [state, serialize, delay, setSearchParams]);
}
