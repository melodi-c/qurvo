import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LayoutDashboard, FolderOpen, Key, List, Users, LogOut, Activity, ChevronsUpDown, GitFork } from 'lucide-react';

const sidebarSections = [
  {
    title: 'Product',
    items: [
      { path: '/dashboards', label: 'Dashboards', icon: LayoutDashboard },
      { path: '/funnels',    label: 'Funnels',    icon: GitFork },
      { path: '/persons',    label: 'Persons',    icon: Users },
      { path: '/events',     label: 'Events',     icon: List },
    ],
  },
  {
    title: 'Configure',
    items: [
      { path: '/projects', label: 'Projects', icon: FolderOpen },
      { path: '/keys',     label: 'API Keys', icon: Key },
    ],
  },
];

export default function Layout() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projectsControllerList(),
  });

  const currentProject = searchParams.get('project');
  const currentProjectName = projects?.find((p) => p.id === currentProject)?.name;

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  function navLink(path: string) {
    return `${path}${currentProject ? `?project=${currentProject}` : ''}`;
  }

  const userInitial = user?.display_name?.slice(0, 1).toUpperCase() ?? '?';

  return (
    <div className="flex h-screen bg-background">

      {/* ── Sidebar ── */}
      <aside className="w-[220px] shrink-0 flex flex-col border-r border-border bg-[#0f0f11]">

        {/* Logo */}
        <Link
          to={navLink('/dashboards')}
          className="h-[44px] flex items-center gap-2.5 px-4 border-b border-border hover:bg-accent/30 transition-colors"
        >
          <Activity className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold tracking-tight">Shot Analytics</span>
        </Link>

        {/* Nav groups */}
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
                    className={`flex items-center gap-2.5 px-2 py-[6px] rounded-md text-sm transition-colors ${
                      isActive(item.path)
                        ? 'bg-accent text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: project + user */}
        <div className="border-t border-border p-2 space-y-1">
          {/* Project switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-accent/50 transition-colors text-left">
                <span className="flex items-center justify-center w-5 h-5 rounded bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
                  {currentProjectName?.slice(0, 2).toUpperCase() ?? '–'}
                </span>
                <span className="flex-1 truncate text-foreground/80">
                  {currentProjectName ?? 'Select project…'}
                </span>
                <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52" align="start" side="top">
              <div className="px-2 py-1 text-xs text-muted-foreground">Switch project</div>
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
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-accent/50 transition-colors text-left">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-[10px] font-bold text-primary shrink-0">
                  {userInitial}
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
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
