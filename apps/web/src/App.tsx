import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import Layout from '@/components/layout';
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';
import DashboardPage from '@/pages/dashboard';
import DashboardsPage from '@/pages/dashboards/index';
import DashboardBuilderPage from '@/pages/dashboards/[id]';
import ProjectsPage from '@/pages/projects';
import ApiKeysPage from '@/pages/api-keys';
import EventsPage from '@/pages/events';
import PersonsPage from '@/pages/persons';
import PersonDetailPage from '@/pages/person-detail';
import FunnelsPage from '@/pages/funnels';
import FunnelEditorPage from '@/pages/funnel-editor';
import TrendsPage from '@/pages/trends';
import TrendEditorPage from '@/pages/trend-editor';
import CohortsPage from '@/pages/cohorts';
import CohortEditorPage from '@/pages/cohort-editor';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/dashboards/:id" element={<DashboardBuilderPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/keys" element={<ApiKeysPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/trends/new" element={<TrendEditorPage />} />
        <Route path="/trends/:insightId" element={<TrendEditorPage />} />
        <Route path="/funnels" element={<FunnelsPage />} />
        <Route path="/funnels/new" element={<FunnelEditorPage />} />
        <Route path="/funnels/:insightId" element={<FunnelEditorPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/cohorts" element={<CohortsPage />} />
        <Route path="/cohorts/new" element={<CohortEditorPage />} />
        <Route path="/cohorts/:cohortId" element={<CohortEditorPage />} />
        <Route path="/persons" element={<PersonsPage />} />
        <Route path="/persons/:personId" element={<PersonDetailPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
