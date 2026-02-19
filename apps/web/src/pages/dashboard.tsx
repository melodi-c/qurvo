import { Navigate, useSearchParams } from 'react-router-dom';

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const project = searchParams.get('project');
  return <Navigate to={`/dashboards${project ? `?project=${project}` : ''}`} replace />;
}
