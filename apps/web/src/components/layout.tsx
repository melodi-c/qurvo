import { Outlet, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LayoutDashboard, FolderOpen, Key, List, LogOut, Users } from 'lucide-react';

const navItems = [
  { path: '/dashboards', label: 'Dashboards', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
  { path: '/keys', label: 'API Keys', icon: Key },
  { path: '/events', label: 'Events', icon: List },
  { path: '/persons', label: 'Persons', icon: Users },
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

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold">Shot Analytics</h1>
          <p className="text-xs text-muted-foreground truncate">{user?.display_name}</p>
        </div>

        <div className="p-3 border-b border-border">
          <p className="text-xs text-muted-foreground mb-1">Project</p>
          <Select
            value={currentProject ?? undefined}
            onValueChange={(value) => setSearchParams({ project: value })}
          >
            <SelectTrigger className="w-full text-sm h-8">
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent>
              {(projects || []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={`${item.path}${currentProject ? `?project=${currentProject}` : ''}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
