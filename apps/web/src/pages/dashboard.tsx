import { Navigate } from 'react-router-dom';
import { routes } from '@/lib/routes';

export default function DashboardPage() {
  return <Navigate to={routes.projects()} replace />;
}
