import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { routes, wrapRoutes } from '@/lib/routes';

export function useAppNavigate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';

  const withProject = useCallback(
    (path: string): string => {
      if (!projectId) return path;
      return `${path}${path.includes('?') ? '&' : '?'}project=${projectId}`;
    },
    [projectId],
  );

  /** Navigate programmatically: `go.dashboards.detail(id)` */
  const go = useMemo(
    () => wrapRoutes(routes, (path) => navigate(withProject(path))),
    [navigate, withProject],
  );

  /** Build link URL: `<Link to={link.dashboards.detail(id)} />` */
  const link = useMemo(
    () => wrapRoutes(routes, withProject),
    [withProject],
  );

  return { go, link, projectId };
}
