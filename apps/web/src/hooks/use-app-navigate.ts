import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectId } from '@/hooks/use-project-id';
import { routes } from '@/lib/routes';

// ---------------------------------------------------------------------------
// Type helpers — strip the first (projectId) argument from route functions
// ---------------------------------------------------------------------------

type DropFirst<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Rest : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CurriedRoutes<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? A extends [string, ...infer Rest]
      ? (...args: Rest) => string
      : () => string
    : T[K] extends Record<string, unknown>
      ? CurriedRoutes<T[K]>
      : never;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NavigatingRoutes<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? A extends [string, ...infer Rest]
      ? (...args: Rest) => void
      : () => void
    : T[K] extends Record<string, unknown>
      ? NavigatingRoutes<T[K]>
      : never;
};

// ---------------------------------------------------------------------------
// Helper: recursively wrap route functions, auto-prepending projectId
// ---------------------------------------------------------------------------

function curriedRoutes<R>(
  obj: Record<string, unknown>,
  projectId: string,
  transform: (path: string) => R,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'function') {
      result[key] = (...args: unknown[]) => {
        const path = (value as (...a: unknown[]) => string)(projectId, ...args);
        return transform(path);
      };
    } else if (typeof value === 'object' && value !== null) {
      result[key] = curriedRoutes(value as Record<string, unknown>, projectId, transform);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAppNavigate() {
  const navigate = useNavigate();
  const projectId = useProjectId();

  /** Navigate programmatically with projectId auto-prepended.
   *  Usage: go.dashboards.list()  →  navigate('/projects/<id>/dashboards')
   *         go.insights.detailByType(type, insightId)  */
  const go = useMemo(
    () =>
      curriedRoutes(
        routes as unknown as Record<string, unknown>,
        projectId,
        (path) => navigate(path),
      ) as NavigatingRoutes<typeof routes>,
    [navigate, projectId],
  );

  /** Build link URL with projectId auto-prepended.
   *  Usage: <Link to={link.dashboards.detail(id)} /> */
  const link = useMemo(
    () =>
      curriedRoutes(
        routes as unknown as Record<string, unknown>,
        projectId,
        (path) => path,
      ) as CurriedRoutes<typeof routes>,
    [projectId],
  );

  return { go, link, navigate, projectId };
}
