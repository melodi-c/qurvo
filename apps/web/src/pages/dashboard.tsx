import { Navigate, useSearchParams } from 'react-router-dom';
import { routes } from '@/lib/routes';

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const project = searchParams.get('project');
  return <Navigate to={project ? `${routes.dashboards.list()}?project=${project}` : routes.dashboards.list()} replace />;
}
