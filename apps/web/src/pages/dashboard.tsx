import { Navigate } from 'react-router-dom';
import { routes } from '@/lib/routes';
import { useProjectId } from '@/hooks/use-project-id';

export default function DashboardPage() {
  const project = useProjectId();
  return <Navigate to={project ? `${routes.dashboards.list()}?project=${project}` : routes.dashboards.list()} replace />;
}
