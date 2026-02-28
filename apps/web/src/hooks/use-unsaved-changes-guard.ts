import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Navigation guard for unsaved changes.
 *
 * Works with BrowserRouter (no data router required):
 *  1. `beforeunload` — browser tab close / reload shows native prompt
 *  2. `pushState`/`replaceState` patching — in-app Link clicks are intercepted
 *  3. `popstate` interception — browser back/forward navigation is blocked
 *
 * Returns dialog state for rendering a ConfirmDialog.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const [showDialog, setShowDialog] = useState(false);
  const pendingNavigation = useRef<string | null>(null);
  const isDirtyRef = useRef(isDirty);
  const navigate = useNavigate();

  // Keep ref in sync with prop so patched functions see current value
  isDirtyRef.current = isDirty;

  // 1. beforeunload — native browser prompt on tab close/reload
  useEffect(() => {
    if (!isDirty) {return;}

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 2. Patch pushState/replaceState to intercept Link navigation
  useEffect(() => {
    if (!isDirty) {return;}

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    const intercept = (original: typeof window.history.pushState) => {
      return function (this: History, data: unknown, unused: string, url?: string | URL | null) {
        if (!isDirtyRef.current || !url) {
          return original.call(this, data, unused, url);
        }

        const targetUrl = typeof url === 'string' ? url : url.toString();
        const currentUrl = window.location.pathname + window.location.search;

        // Same URL — allow (e.g. internal state updates)
        if (targetUrl === currentUrl) {
          return original.call(this, data, unused, url);
        }

        // Different URL — block and show dialog
        pendingNavigation.current = targetUrl;
        setShowDialog(true);
        return undefined;
      };
    };

    window.history.pushState = intercept(originalPushState) as typeof window.history.pushState;
    window.history.replaceState = intercept(originalReplaceState) as typeof window.history.replaceState;

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [isDirty]);

  // 3. popstate — intercept browser back/forward buttons
  useEffect(() => {
    if (!isDirty) {return;}

    const handler = () => {
      // Re-push current URL to cancel the navigation
      window.history.pushState(null, '', window.location.href);
      pendingNavigation.current = '__popstate__';
      setShowDialog(true);
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isDirty]);

  const confirmNavigation = useCallback(() => {
    setShowDialog(false);
    const target = pendingNavigation.current;
    pendingNavigation.current = null;

    if (!target) {return;}

    // Temporarily mark as clean to avoid re-triggering guard
    isDirtyRef.current = false;

    if (target === '__popstate__') {
      window.history.back();
    } else {
      navigate(target);
    }
  }, [navigate]);

  const cancelNavigation = useCallback(() => {
    setShowDialog(false);
    pendingNavigation.current = null;
  }, []);

  /** Synchronously mark the guard as clean so the next navigation is not blocked. */
  const markClean = useCallback(() => {
    isDirtyRef.current = false;
  }, []);

  return { showDialog, confirmNavigation, cancelNavigation, markClean };
}
