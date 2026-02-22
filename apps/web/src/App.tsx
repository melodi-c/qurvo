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
import SettingsPage from '@/pages/settings/index';
import ProfilePage from '@/pages/profile/index';
import EventsPage from '@/pages/events';
import PersonsPage from '@/pages/persons';
import PersonDetailPage from '@/pages/person-detail';
import InsightsPage from '@/pages/insights/index';
import TrendEditorPage from '@/pages/trend-editor';
import FunnelEditorPage from '@/pages/funnel-editor';
import RetentionEditorPage from '@/pages/retention-editor';
import LifecycleEditorPage from '@/pages/lifecycle-editor';
import StickinessEditorPage from '@/pages/stickiness-editor';
import PathsEditorPage from '@/pages/paths-editor';
import CohortsPage from '@/pages/cohorts';
import CohortEditorPage from '@/pages/cohort-editor';
import UnitEconomicsPage from '@/pages/unit-economics';
import AiPage from '@/pages/ai/index';
import VerifyEmailPage from '@/pages/verify-email';
import EventDefinitionsPage from '@/pages/event-definitions';
import EventDefinitionDetailPage from '@/pages/event-definition-detail';
import { routes, routePatterns } from '@/lib/routes';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const pendingVerification = useAuthStore((s) => s.pendingVerification);

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to={routes.login()} replace />;
  if (pendingVerification) return <Navigate to={routes.verifyEmail()} replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route path={routePatterns.login} element={<LoginPage />} />
      <Route path={routePatterns.register} element={<RegisterPage />} />
      <Route path={routePatterns.verifyEmail} element={<VerifyEmailPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path={routePatterns.home} element={<DashboardPage />} />
        <Route path={routePatterns.dashboards.list} element={<DashboardsPage />} />
        <Route path={routePatterns.dashboards.detail} element={<DashboardBuilderPage />} />
        <Route path={routePatterns.projects} element={<ProjectsPage />} />
        <Route path={routePatterns.keys} element={<ApiKeysPage />} />
        <Route path={routePatterns.settings} element={<SettingsPage />} />
        <Route path={routePatterns.profile} element={<ProfilePage />} />
        <Route path={routePatterns.invites} element={<Navigate to={routes.profile({ tab: 'invites' })} replace />} />
        <Route path={routePatterns.insights.list} element={<InsightsPage />} />
        <Route path={routePatterns.insights.trends.new} element={<TrendEditorPage />} />
        <Route path={routePatterns.insights.trends.detail} element={<TrendEditorPage />} />
        <Route path={routePatterns.insights.funnels.new} element={<FunnelEditorPage />} />
        <Route path={routePatterns.insights.funnels.detail} element={<FunnelEditorPage />} />
        <Route path={routePatterns.insights.retentions.new} element={<RetentionEditorPage />} />
        <Route path={routePatterns.insights.retentions.detail} element={<RetentionEditorPage />} />
        <Route path={routePatterns.insights.lifecycles.new} element={<LifecycleEditorPage />} />
        <Route path={routePatterns.insights.lifecycles.detail} element={<LifecycleEditorPage />} />
        <Route path={routePatterns.insights.stickiness.new} element={<StickinessEditorPage />} />
        <Route path={routePatterns.insights.stickiness.detail} element={<StickinessEditorPage />} />
        <Route path={routePatterns.insights.paths.new} element={<PathsEditorPage />} />
        <Route path={routePatterns.insights.paths.detail} element={<PathsEditorPage />} />
        {/* Redirects from old routes */}
        <Route path={routePatterns.legacy.trends} element={<Navigate to="/insights?type=trend" replace />} />
        <Route path={routePatterns.legacy.funnels} element={<Navigate to="/insights?type=funnel" replace />} />
        <Route path={routePatterns.legacy.retentions} element={<Navigate to="/insights?type=retention" replace />} />
        <Route path={routePatterns.unitEconomics} element={<UnitEconomicsPage />} />
        <Route path={routePatterns.events} element={<EventsPage />} />
        <Route path={routePatterns.cohorts.list} element={<CohortsPage />} />
        <Route path={routePatterns.cohorts.new} element={<CohortEditorPage />} />
        <Route path={routePatterns.cohorts.detail} element={<CohortEditorPage />} />
        <Route path={routePatterns.persons.list} element={<PersonsPage />} />
        <Route path={routePatterns.persons.detail} element={<PersonDetailPage />} />
        <Route path={routePatterns.ai} element={<AiPage />} />
        <Route path={routePatterns.dataManagement.list} element={<EventDefinitionsPage />} />
        <Route path={routePatterns.dataManagement.detail} element={<EventDefinitionDetailPage />} />
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
