import { useMemo, type MutableRefObject } from 'react';

export function useIsDirty(
  deps: unknown[],
  initialRef: MutableRefObject<unknown[]>,
): boolean {
  return useMemo(() => {
    const initial = initialRef.current;
    for (let i = 0; i < deps.length; i++) {
      const current = deps[i];
      const saved = initial[i];
      if (typeof current === 'object' && current !== null) {
        if (JSON.stringify(current) !== JSON.stringify(saved)) {return true;}
      } else {
        if (current !== saved) {return true;}
      }
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
