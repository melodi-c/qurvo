import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { useAuthStore } from '@/stores/auth';
import { useLanguageStore } from '@/stores/language';
import { useProjectStore } from '@/stores/project';
import { useSidebar } from '@/hooks/use-sidebar';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { api } from '@/api/client';
import { routes } from '@/lib/routes';
import translations from '@/components/layout.translations';
import {
  LayoutDashboard,
  List,
  Users,
  UsersRound,
  Lightbulb,
  Settings,
  Globe,
  Database,
  Sparkles,
  Bell,
  Clock,
  FolderOpen,
} from 'lucide-react';

export function useLayoutData() {
  const { t } = useLocalTranslation(translations);
  const location = useLocation();
  const navigate = useNavigate();

  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { isOpen, open, close } = useSidebar();
  const currentLang = useLanguageStore((s) => s.language);
  const changeLanguage = useLanguageStore((s) => s.changeLanguage);

  const currentProject = useProjectId();
  const lastProjectId = useProjectStore((s) => s.lastProjectId);

  // The effective project ID: URL param when available, localStorage fallback otherwise
  const effectiveProjectId = currentProject || lastProjectId;

  const sidebarSections = useMemo(
    () => [
      {
        title: t('product'),
        items: [
          { path: routes.dashboards.list.pattern, label: t('dashboards'), icon: LayoutDashboard },
          { path: routes.webAnalytics.pattern, label: t('webAnalytics'), icon: Globe },
          { path: routes.insights.list.pattern, label: t('insights'), icon: Lightbulb },
          { path: routes.cohorts.list.pattern, label: t('cohorts'), icon: UsersRound },
          { path: routes.persons.list.pattern, label: t('persons'), icon: Users },
          { path: routes.events.pattern, label: t('events'), icon: List },
          { path: routes.ai.pattern, label: t('aiAssistant'), icon: Sparkles, exact: true },
          { path: routes.aiMonitors.pattern, label: t('aiMonitors'), icon: Bell },
          { path: routes.aiScheduledJobs.pattern, label: t('aiScheduledJobs'), icon: Clock },
        ],
      },
      {
        title: t('configure'),
        items: [
          { path: routes.projects.pattern, label: t('projects'), icon: FolderOpen, exact: true },
          { path: routes.dataManagement.list.pattern, label: t('dataManagement'), icon: Database },
          { path: routes.settings.pattern, label: t('settings'), icon: Settings },
        ],
      },
    ],
    [t],
  );

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projectsControllerList(),
  });

  const { data: myInvites } = useQuery({
    queryKey: ['myInvites'],
    queryFn: () => api.myInvitesControllerGetMyInvites(),
  });

  const pendingInvitesCount = myInvites?.length ?? 0;
  const currentProjectData = projects?.find((p) => p.id === currentProject);
  const currentProjectName = currentProjectData?.name;
  const currentProjectSlug = currentProjectData?.slug ?? '';
  const currentProjectIsDemo = currentProjectData?.is_demo ?? false;
  const hasProjects = projects && projects.length > 0;
  const projectsLoaded = projects !== undefined;

  function isActive(path: string, exact?: boolean): boolean {
    // Resolve :projectId pattern to the actual project ID so patterns match current URL.
    // Use effectiveProjectId (URL param or localStorage fallback) so active state is preserved
    // on project-less pages like /profile and /projects.
    const resolvedPath = effectiveProjectId
      ? path.replace(':projectId', effectiveProjectId)
      : path;
    if (exact) return location.pathname === resolvedPath;
    return location.pathname === resolvedPath || location.pathname.startsWith(resolvedPath + '/');
  }

  function navLink(path: string): string {
    if (!path.includes(':projectId')) return path;
    // Use effectiveProjectId as fallback so sidebar links work on project-less pages.
    // If no project is known at all, fall back to the projects list.
    if (!effectiveProjectId) return routes.projects();
    return path.replace(':projectId', effectiveProjectId);
  }

  const userInitial = user?.display_name?.slice(0, 1).toUpperCase() ?? '?';
  const logoHref =
    hasProjects && effectiveProjectId
      ? `/projects/${effectiveProjectId}/dashboards`
      : routes.projects();

  const shouldRedirectToProjects =
    projectsLoaded &&
    !hasProjects &&
    location.pathname !== routes.projects.pattern &&
    !location.pathname.startsWith(routes.profile.pattern);

  return {
    t,
    location,
    navigate,
    logout,
    user,
    sidebar: { isOpen, open, close },
    currentLang,
    changeLanguage,
    currentProject,
    sidebarSections,
    projects,
    pendingInvitesCount,
    currentProjectName,
    currentProjectSlug,
    currentProjectIsDemo,
    hasProjects,
    shouldRedirectToProjects,
    isActive,
    navLink,
    userInitial,
    logoHref,
  };
}
