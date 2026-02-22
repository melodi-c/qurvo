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
import { routes } from '@/lib/routes';

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
      <Route path={routes.login.pattern} element={<LoginPage />} />
      <Route path={routes.register.pattern} element={<RegisterPage />} />
      <Route path={routes.verifyEmail.pattern} element={<VerifyEmailPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path={routes.home.pattern} element={<DashboardPage />} />
        <Route path={routes.dashboards.list.pattern} element={<DashboardsPage />} />
        <Route path={routes.dashboards.detail.pattern} element={<DashboardBuilderPage />} />
        <Route path={routes.projects.pattern} element={<ProjectsPage />} />
        <Route path={routes.keys.pattern} element={<ApiKeysPage />} />
        <Route path={routes.settings.pattern} element={<SettingsPage />} />
        <Route path={routes.profile.pattern} element={<ProfilePage />} />
        <Route path={routes.invites.pattern} element={<Navigate to={routes.profile({ tab: 'invites' })} replace />} />
        <Route path={routes.insights.list.pattern} element={<InsightsPage />} />
        <Route path={routes.insights.trends.new.pattern} element={<TrendEditorPage />} />
        <Route path={routes.insights.trends.detail.pattern} element={<TrendEditorPage />} />
        <Route path={routes.insights.funnels.new.pattern} element={<FunnelEditorPage />} />
        <Route path={routes.insights.funnels.detail.pattern} element={<FunnelEditorPage />} />
        <Route path={routes.insights.retentions.new.pattern} element={<RetentionEditorPage />} />
        <Route path={routes.insights.retentions.detail.pattern} element={<RetentionEditorPage />} />
        <Route path={routes.insights.lifecycles.new.pattern} element={<LifecycleEditorPage />} />
        <Route path={routes.insights.lifecycles.detail.pattern} element={<LifecycleEditorPage />} />
        <Route path={routes.insights.stickiness.new.pattern} element={<StickinessEditorPage />} />
        <Route path={routes.insights.stickiness.detail.pattern} element={<StickinessEditorPage />} />
        <Route path={routes.insights.paths.new.pattern} element={<PathsEditorPage />} />
        <Route path={routes.insights.paths.detail.pattern} element={<PathsEditorPage />} />
        {/* Redirects from old routes */}
        <Route path={routes.legacy.trends.pattern} element={<Navigate to="/insights?type=trend" replace />} />
        <Route path={routes.legacy.funnels.pattern} element={<Navigate to="/insights?type=funnel" replace />} />
        <Route path={routes.legacy.retentions.pattern} element={<Navigate to="/insights?type=retention" replace />} />
        <Route path={routes.unitEconomics.pattern} element={<UnitEconomicsPage />} />
        <Route path={routes.events.pattern} element={<EventsPage />} />
        <Route path={routes.cohorts.list.pattern} element={<CohortsPage />} />
        <Route path={routes.cohorts.new.pattern} element={<CohortEditorPage />} />
        <Route path={routes.cohorts.detail.pattern} element={<CohortEditorPage />} />
        <Route path={routes.persons.list.pattern} element={<PersonsPage />} />
        <Route path={routes.persons.detail.pattern} element={<PersonDetailPage />} />
        <Route path={routes.ai.pattern} element={<AiPage />} />
        <Route path={routes.dataManagement.list.pattern} element={<EventDefinitionsPage />} />
        <Route path={routes.dataManagement.detail.pattern} element={<EventDefinitionDetailPage />} />
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
