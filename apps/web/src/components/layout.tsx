import { Outlet, Navigate } from 'react-router-dom';
import { useLayoutData } from '@/hooks/use-layout-data';
import { LayoutTopbar } from '@/components/layout-topbar';
import { SidebarNav } from '@/components/sidebar-nav';
import { ProjectSwitcher, UserMenu } from '@/components/user-menu';
import { routes } from '@/lib/routes';

export default function Layout() {
  const {
    t,
    setSearchParams,
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
    hasProjects,
    shouldRedirectToProjects,
    isActive,
    navLink,
    userInitial,
    logoHref,
  } = useLayoutData();

  if (shouldRedirectToProjects) {
    return <Navigate to={routes.projects()} replace />;
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background">
      {/* Mobile top bar */}
      <LayoutTopbar onMenuOpen={sidebar.open} userInitial={userInitial} logoHref={logoHref} />

      {/* Backdrop (mobile only) */}
      {sidebar.isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
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
            onProjectSwitch={(id) => setSearchParams({ project: id })}
            selectProjectLabel={t('selectProject')}
            switchProjectLabel={t('switchProject')}
            newProjectLabel={t('newProject')}
          />
        )}

        <UserMenu
          user={user}
          userInitial={userInitial}
          pendingInvitesCount={pendingInvitesCount}
          currentLang={currentLang}
          onLanguageChange={changeLanguage}
          onLogout={logout}
          profileLabel={t('profile')}
          languageLabel={t('language')}
          signOutLabel={t('signOut')}
        />
      </SidebarNav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
