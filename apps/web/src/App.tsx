import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { routes } from '@/lib/routes';
import { useAuthStore } from '@/stores/auth';
import appTranslations from '@/App.translations';
import Layout from '@/components/layout';

// Eager: auth pages (needed immediately)
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';
import VerifyEmailPage from '@/pages/verify-email';

// Lazy: all other pages
const DashboardPage = lazy(() => import('@/pages/dashboard'));
const DashboardsPage = lazy(() => import('@/pages/dashboards/index'));
const DashboardBuilderPage = lazy(() => import('@/pages/dashboards/[id]'));
const ProjectsPage = lazy(() => import('@/pages/projects'));
const ApiKeysPage = lazy(() => import('@/pages/api-keys'));
const SettingsPage = lazy(() => import('@/pages/settings/index'));
const ProfilePage = lazy(() => import('@/pages/profile/index'));
const EventsPage = lazy(() => import('@/pages/events'));
const PersonsPage = lazy(() => import('@/pages/persons'));
const PersonDetailPage = lazy(() => import('@/pages/person-detail'));
const InsightsPage = lazy(() => import('@/pages/insights/index'));
const TrendEditorPage = lazy(() => import('@/pages/trend-editor'));
const FunnelEditorPage = lazy(() => import('@/pages/funnel-editor'));
const RetentionEditorPage = lazy(() => import('@/pages/retention-editor'));
const LifecycleEditorPage = lazy(() => import('@/pages/lifecycle-editor'));
const StickinessEditorPage = lazy(() => import('@/pages/stickiness-editor'));
const PathsEditorPage = lazy(() => import('@/pages/paths-editor'));
const CohortsPage = lazy(() => import('@/pages/cohorts'));
const CohortEditorPage = lazy(() => import('@/pages/cohort-editor'));
const AiPage = lazy(() => import('@/pages/ai/index'));
const EventDefinitionsPage = lazy(() => import('@/pages/event-definitions'));
const EventDefinitionDetailPage = lazy(() => import('@/pages/event-definition-detail'));
const WebAnalyticsPage = lazy(() => import('@/pages/web-analytics'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const pendingVerification = useAuthStore((s) => s.pendingVerification);
  const { t } = useLocalTranslation(appTranslations);

  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">{t('loading')}</div>;
  if (!user) return <Navigate to={routes.login()} replace />;
  if (pendingVerification) return <Navigate to={routes.verifyEmail()} replace />;
  return <>{children}</>;
}

function SuspenseLoading() {
  const { t } = useLocalTranslation(appTranslations);
  return (
    <div className="flex items-center justify-center gap-2 h-screen text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      {t('loading')}
    </div>
  );
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
            <Suspense fallback={<SuspenseLoading />}>
              <Layout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route path={routes.home.pattern} element={<DashboardPage />} />
        <Route path={routes.webAnalytics.pattern} element={<WebAnalyticsPage />} />
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
        <Route path={routes.legacy.trends.pattern} element={<Navigate to={`${routes.insights.list()}?type=trend`} replace />} />
        <Route path={routes.legacy.funnels.pattern} element={<Navigate to={`${routes.insights.list()}?type=funnel`} replace />} />
        <Route path={routes.legacy.retentions.pattern} element={<Navigate to={`${routes.insights.list()}?type=retention`} replace />} />
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
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
