import { useMemo } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useProjectId } from '@/hooks/use-project-id';
import { useAuthStore } from '@/stores/auth';
import { useLanguageStore } from '@/stores/language';
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
} from 'lucide-react';

export function useLayoutData() {
  const { t } = useLocalTranslation(translations);
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { isOpen, open, close } = useSidebar();
  const currentLang = useLanguageStore((s) => s.language);
  const changeLanguage = useLanguageStore((s) => s.changeLanguage);

  const currentProject = useProjectId();

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
          { path: routes.ai.pattern, label: t('aiAssistant'), icon: Sparkles },
        ],
      },
      {
        title: t('configure'),
        items: [
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
  const currentProjectIsDemo = currentProjectData?.is_demo ?? false;
  const hasProjects = projects && projects.length > 0;
  const projectsLoaded = projects !== undefined;

  function isActive(path: string): boolean {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  function navLink(path: string): string {
    return `${path}${currentProject ? `?project=${currentProject}` : ''}`;
  }

  const userInitial = user?.display_name?.slice(0, 1).toUpperCase() ?? '?';
  const logoHref = hasProjects ? navLink(routes.dashboards.list.pattern) : routes.projects();

  const shouldRedirectToProjects =
    projectsLoaded &&
    !hasProjects &&
    location.pathname !== routes.projects.pattern &&
    !location.pathname.startsWith(routes.profile.pattern);

  return {
    t,
    location,
    setSearchParams,
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
    currentProjectIsDemo,
    hasProjects,
    shouldRedirectToProjects,
    isActive,
    navLink,
    userInitial,
    logoHref,
  };
}
