import { Suspense, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useLayoutData } from '@/hooks/use-layout-data';
import { LayoutTopbar } from '@/components/layout-topbar';
import { SidebarNav } from '@/components/sidebar-nav';
import { ProjectSwitcher, UserMenu } from '@/components/user-menu';
import { DemoBanner } from '@/components/DemoBanner';
import { useProjectStore } from '@/stores/project';
import { routes } from '@/lib/routes';

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center gap-2 h-full min-h-64 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

export default function Layout() {
  const {
    t,
    navigate,
    logout,
    user,
    sidebar,
    currentLang,
    changeLanguage,
    currentProject,
    sidebarSections,
    projects,
    pendingInvitesCount,
    currentProjectName,
    currentProjectIsDemo,
    currentProjectTimezone,
    hasProjects,
    shouldRedirectToProjects,
    isActive,
    navLink,
    userInitial,
    logoHref,
  } = useLayoutData();

  const setLastProjectId = useProjectStore((s) => s.setLastProjectId);
  const setProjectTimezone = useProjectStore((s) => s.setProjectTimezone);

  // Persist the last visited project ID so sidebar links work on project-less pages
  useEffect(() => {
    if (currentProject) {
      setLastProjectId(currentProject);
    }
  }, [currentProject, setLastProjectId]);

  // Sync project timezone into the store so analytics hooks can read it.
  // Reset to UTC when navigating to a page without a project context.
  useEffect(() => {
    setProjectTimezone(currentProjectTimezone ?? 'UTC');
  }, [currentProjectTimezone, setProjectTimezone]);

  useEffect(() => {
    if (sidebar.isOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [sidebar.isOpen]);

  if (shouldRedirectToProjects) {
    return <Navigate to={routes.projects()} replace />;
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background">
      {/* Mobile top bar */}
      <div
        className="contents"
        aria-hidden={sidebar.isOpen || undefined}
        inert={sidebar.isOpen || undefined}
      >
        <LayoutTopbar onMenuOpen={sidebar.open} userInitial={userInitial} logoHref={logoHref} />
      </div>

      {/* Backdrop (mobile only) */}
      {sidebar.isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
          onClick={sidebar.close}
        />
      )}

      {/* Sidebar */}
      <SidebarNav
        isOpen={sidebar.isOpen}
        onClose={sidebar.close}
        logoHref={logoHref}
        hasProjects={!!hasProjects}
        sections={sidebarSections}
        isActive={isActive}
        navLink={navLink}
        navigationLabel={t('navigation')}
        closeNavLabel={t('closeNav')}
      >
        {hasProjects && (
          <ProjectSwitcher
            projects={projects ?? []}
            currentProject={currentProject}
            currentProjectName={currentProjectName}
            currentProjectIsDemo={currentProjectIsDemo}
            onProjectSwitch={(id) => navigate(`/projects/${id}/dashboards`)}
            selectProjectLabel={t('selectProject')}
            switchProjectLabel={t('switchProject')}
            manageProjectsLabel={t('manageProjects')}
            demoBadgeLabel={t('demo')}
          />
        )}

        <UserMenu
          user={user}
          userInitial={userInitial}
          pendingInvitesCount={pendingInvitesCount}
          currentLang={currentLang}
          onLanguageChange={changeLanguage}
          onLogout={logout}
          isStaff={user?.is_staff}
          profileLabel={t('profile')}
          languageLabel={t('language')}
          signOutLabel={t('signOut')}
          adminLabel={t('admin')}
        />
      </SidebarNav>

      {/* Main content */}
      <main
        className="flex-1 overflow-auto flex flex-col"
        aria-hidden={sidebar.isOpen || undefined}
        inert={sidebar.isOpen || undefined}
      >
        {currentProject && (
          <DemoBanner projectId={currentProject} isDemo={currentProjectIsDemo} />
        )}
        <div className="p-4 lg:p-6 flex-1">
          <Suspense fallback={<PageLoadingFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
