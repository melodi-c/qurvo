import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Loader2, LayoutDashboard, Users, FolderOpen, CreditCard, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/lib/routes';
import { QurvoLogo } from '@/components/qurvo-logo';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './admin-layout.translations';

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center gap-2 h-full min-h-64 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

export default function AdminLayout() {
  const { t } = useLocalTranslation(translations);
  const location = useLocation();

  function isActive(path: string): boolean {
    if (path === routes.admin.overview.pattern) {
      return location.pathname === path;
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  const navItems = [
    { path: routes.admin.overview.pattern, label: t('overview'), icon: LayoutDashboard },
    { path: routes.admin.users.list.pattern, label: t('users'), icon: Users },
    { path: routes.admin.projects.list.pattern, label: t('projects'), icon: FolderOpen },
    { path: routes.admin.plans.list.pattern, label: t('plans'), icon: CreditCard },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background">
      {/* Sidebar */}
      <aside
        aria-label={t('navigation')}
        className="hidden lg:flex flex-col w-[220px] border-r border-border bg-sidebar shrink-0"
      >
        {/* Logo */}
        <div className="h-[var(--topbar-height)] flex items-center gap-2.5 px-4 border-b border-border">
          <QurvoLogo className="w-5 h-5 text-primary shrink-0" />
          <span className="text-sm font-semibold tracking-tight">{t('adminPanel')}</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
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
        </nav>

        {/* Back to dashboard */}
        <div className="border-t border-border p-2">
          <Link
            to={routes.projects()}
            className="flex items-center gap-2.5 px-2 py-[6px] rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {t('backToDashboard')}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-4 lg:p-6">
          <Suspense fallback={<PageLoadingFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
