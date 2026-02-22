import { Outlet, Link, useLocation, useSearchParams, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { useLanguageStore, languages } from '@/stores/language';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LayoutTopbar } from '@/components/layout-topbar';
import { useSidebar } from '@/hooks/use-sidebar';
import { LayoutDashboard, List, Users, UsersRound, LogOut, ChevronsUpDown, Lightbulb, Settings, Plus, X, Calculator, Sparkles, User, Database, Globe, Languages } from 'lucide-react';
import { QurvoLogo } from '@/components/qurvo-logo';
import { routes } from '@/lib/routes';
import translations from './layout.translations';
import type { Language } from '@/i18n/types';

export default function Layout() {
  const { t } = useLocalTranslation(translations);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { isOpen, open, close } = useSidebar();
  const currentLang = useLanguageStore((s) => s.language);
  const changeLanguage = useLanguageStore((s) => s.changeLanguage);

  const navigate = useNavigate();

  const sidebarSections = [
    {
      title: t('product'),
      items: [
        { path: routes.dashboards.list.pattern, label: t('dashboards'), icon: LayoutDashboard },
        { path: routes.webAnalytics.pattern,    label: t('webAnalytics'),   icon: Globe },
        { path: routes.insights.list.pattern,   label: t('insights'),        icon: Lightbulb },
        { path: routes.unitEconomics.pattern,   label: t('unitEconomics'),  icon: Calculator },
        { path: routes.cohorts.list.pattern,    label: t('cohorts'),         icon: UsersRound },
        { path: routes.persons.list.pattern,    label: t('persons'),    icon: Users },
        { path: routes.events.pattern,          label: t('events'),     icon: List },
        { path: routes.ai.pattern,              label: t('aiAssistant'), icon: Sparkles },
      ],
    },
    {
      title: t('configure'),
      items: [
        { path: routes.dataManagement.list.pattern, label: t('dataManagement'), icon: Database },
        { path: routes.settings.pattern,             label: t('settings'), icon: Settings },
      ],
    },
  ];

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projectsControllerList(),
  });

  const { data: myInvites } = useQuery({
    queryKey: ['myInvites'],
    queryFn: () => api.myInvitesControllerGetMyInvites(),
  });

  const pendingInvitesCount = myInvites?.length ?? 0;

  const currentProject = searchParams.get('project');
  const currentProjectName = projects?.find((p) => p.id === currentProject)?.name;

  const hasProjects = projects && projects.length > 0;
  const projectsLoaded = projects !== undefined;


  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  function navLink(path: string) {
    return `${path}${currentProject ? `?project=${currentProject}` : ''}`;
  }

  const userInitial = user?.display_name?.slice(0, 1).toUpperCase() ?? '?';
  const logoHref = hasProjects ? navLink(routes.dashboards.list.pattern) : routes.projects();

  // Redirect to /projects when user has no projects and is not already there
  if (projectsLoaded && !hasProjects && location.pathname !== routes.projects.pattern && !location.pathname.startsWith(routes.profile.pattern)) {
    return <Navigate to={routes.projects()} replace />;
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background">

      {/* ── Mobile top bar ── */}
      <LayoutTopbar
        onMenuOpen={open}
        userInitial={userInitial}
        logoHref={logoHref}
      />

      {/* ── Backdrop (mobile only) ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
          onClick={close}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-label="Navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[220px] flex flex-col border-r border-border bg-[#0f0f11]',
          'transition-transform duration-200 ease-in-out',
          'lg:static lg:z-auto lg:translate-x-0 lg:shrink-0 lg:transition-none',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Close button — mobile only */}
        <button
          onClick={close}
          className="lg:hidden absolute top-3 right-3 z-10 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          aria-label={t('closeNav')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Logo */}
        <Link
          to={logoHref}
          className="h-[44px] flex items-center gap-2.5 px-4 border-b border-border hover:bg-accent/30 transition-colors"
        >
          <QurvoLogo className="w-5 h-5 text-primary shrink-0" />
          <span className="text-sm font-semibold tracking-tight">Qurvo</span>
        </Link>

        {/* Nav groups — hidden when no projects */}
        {hasProjects && (
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
            {sidebarSections.map((section) => (
              <div key={section.title}>
                <p className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-2 mb-1">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <Link
                      key={item.path}
                      to={navLink(item.path)}
                      className={cn(
                        'flex items-center gap-2.5 px-2 py-[6px] rounded-md text-sm transition-colors',
                        isActive(item.path)
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        )}

        {/* Spacer when no projects (no nav) */}
        {!hasProjects && <div className="flex-1" />}

        {/* Bottom: project + user */}
        <div className="border-t border-border p-2 space-y-1">
          {/* Project switcher — hidden when no projects */}
          {hasProjects && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-accent/50 transition-colors text-left">
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
                    {currentProjectName?.slice(0, 2).toUpperCase() ?? '–'}
                  </span>
                  <span className="flex-1 truncate text-foreground/80">
                    {currentProjectName ?? t('selectProject')}
                  </span>
                  <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52" align="start" side="top">
                <div className="px-2 py-1 text-xs text-muted-foreground">{t('switchProject')}</div>
                <DropdownMenuSeparator />
                {(projects ?? []).map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => setSearchParams({ project: p.id })}
                    className={currentProject === p.id ? 'bg-accent' : ''}
                  >
                    {p.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(routes.projects())}>
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  {t('newProject')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-accent/50 transition-colors text-left">
                <span className="relative flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-[10px] font-bold text-primary shrink-0">
                  {userInitial}
                  {pendingInvitesCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
                  )}
                </span>
                <span className="flex-1 truncate text-foreground/80">{user?.display_name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium leading-none">{user?.display_name}</p>
                <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(routes.profile())}>
                <User className="h-4 w-4 mr-2" />
                <span className="flex-1">{t('profile')}</span>
                {pendingInvitesCount > 0 && (
                  <span className="flex items-center justify-center min-w-5 h-5 rounded-full bg-primary text-background text-[10px] font-bold px-1">
                    {pendingInvitesCount}
                  </span>
                )}
              </DropdownMenuItem>

              {/* Language switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Languages className="h-4 w-4 mr-2" />
                    <span className="flex-1">{t('language')}</span>
                    <span className="text-xs text-muted-foreground">{languages[currentLang]}</span>
                  </DropdownMenuItem>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  {(Object.entries(languages) as [Language, string][]).map(([code, label]) => (
                    <DropdownMenuItem
                      key={code}
                      onClick={() => changeLanguage(code)}
                      className={currentLang === code ? 'bg-accent' : ''}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                {t('signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
