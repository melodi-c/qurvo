import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface WidgetControls {
  onRefresh: () => void;
  isFetching: boolean;
  cachedAt?: string;
  fromCache?: boolean;
  onExportCsv?: () => void;
}

interface WidgetControlsContextValue {
  controls: WidgetControls | null;
  register: (controls: WidgetControls) => void;
}

const WidgetControlsCtx = createContext<WidgetControlsContextValue>({
  controls: null,
  register: () => {},
});

export function WidgetControlsProvider({ children }: { children: ReactNode }) {
  const [controls, setControls] = useState<WidgetControls | null>(null);

  const register = useCallback((c: WidgetControls) => {
    setControls(c);
  }, []);

  return (
    <WidgetControlsCtx.Provider value={{ controls, register }}>
      {children}
    </WidgetControlsCtx.Provider>
  );
}

export function useWidgetControls(): WidgetControls | null {
  return useContext(WidgetControlsCtx).controls;
}

/**
 * Hook for widgets to register their controls with the parent InsightCard.
 * Call this inside widget components with the relevant control values.
 */
export function useRegisterWidgetControls(controls: WidgetControls): void {
  const { register } = useContext(WidgetControlsCtx);
  const prev = useRef<string>('');

  useEffect(() => {
    // Serialize to avoid re-registering on every render when values haven't changed
    const key = `${controls.isFetching}|${controls.cachedAt}|${controls.fromCache}|${!!controls.onExportCsv}`;
    if (key !== prev.current) {
      prev.current = key;
      register(controls);
    }
  });
}
