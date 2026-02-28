import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectId } from '@/hooks/use-project-id';
import { routes } from '@/lib/routes';

// ---------------------------------------------------------------------------
// Type helpers — strip the first (projectId) argument from route functions
// ---------------------------------------------------------------------------

type CurriedRoutes<T, R> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? A extends [string, ...infer Rest]
      ? (...args: Rest) => R
      : () => R
    : T[K] extends Record<string, unknown>
      ? CurriedRoutes<T[K], R>
      : never;
};

// ---------------------------------------------------------------------------
// Helper: recursively wrap route functions, auto-prepending projectId.
// The runtime obj is always a plain object with function/object leaves,
// but TypeScript cannot narrow `typeof routes` structurally inside a loop.
// We keep the internal casts minimal — only at property access boundaries.
// ---------------------------------------------------------------------------

function curryRoutes<R>(
  obj: typeof routes,
  projectId: string,
  transform: (path: string) => R,
): CurriedRoutes<typeof routes, R> {
  const rec = (node: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (typeof value === 'function') {
        result[key] = (...args: unknown[]) => {
          const path = (value as (...a: unknown[]) => string)(projectId, ...args);
          return transform(path);
        };
      } else if (typeof value === 'object' && value !== null) {
        result[key] = rec(value as Record<string, unknown>);
      }
    }
    return result;
  };
  // routes is structurally Record<string, fn | object> at runtime
  return rec(obj as Record<string, unknown>) as CurriedRoutes<typeof routes, R>;
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
    () => curryRoutes(routes, projectId, (path) => navigate(path)),
    [navigate, projectId],
  );

  /** Build link URL with projectId auto-prepended.
   *  Usage: <Link to={link.dashboards.detail(id)} /> */
  const link = useMemo(
    () => curryRoutes(routes, projectId, (path) => path),
    [projectId],
  );

  return { go, link, navigate, projectId };
}
