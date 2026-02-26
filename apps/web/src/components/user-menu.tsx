import { useNavigate } from 'react-router-dom';
import { languages } from '@/stores/language';
import { LogOut, User, Languages, Plus, ChevronsUpDown, ShieldCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { routes } from '@/lib/routes';
import type { Language } from '@/i18n/types';
import type { ProjectWithRole } from '@/api/generated/Api';

interface ProjectSwitcherProps {
  projects: ProjectWithRole[];
  currentProject: string;
  currentProjectName: string | undefined;
  currentProjectIsDemo?: boolean;
  onProjectSwitch: (projectId: string) => void;
  selectProjectLabel: string;
  switchProjectLabel: string;
  newProjectLabel: string;
  demoBadgeLabel: string;
}

export function ProjectSwitcher({
  projects,
  currentProject,
  currentProjectName,
  currentProjectIsDemo,
  onProjectSwitch,
  selectProjectLabel,
  switchProjectLabel,
  newProjectLabel,
  demoBadgeLabel,
}: ProjectSwitcherProps) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-accent/50 transition-colors text-left">
          <span className="flex items-center justify-center w-5 h-5 rounded bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
            {currentProjectName?.slice(0, 2).toUpperCase() ?? '\u2013'}
          </span>
          <span className="flex-1 truncate text-foreground/80">
            {currentProjectName ?? selectProjectLabel}
          </span>
          {currentProjectIsDemo && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
              {demoBadgeLabel}
            </Badge>
          )}
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52" align="start" side="top">
        <div className="px-2 py-1 text-xs text-muted-foreground">{switchProjectLabel}</div>
        <DropdownMenuSeparator />
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => onProjectSwitch(p.id)}
            className={currentProject === p.id ? 'bg-accent' : ''}
          >
            <span className="flex-1 truncate">{p.name}</span>
            {p.is_demo && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-1 shrink-0">
                {demoBadgeLabel}
              </Badge>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(routes.projects())}>
          <Plus className="h-3.5 w-3.5 mr-2" />
          {newProjectLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface UserMenuProps {
  user: { display_name: string; email: string } | null;
  userInitial: string;
  pendingInvitesCount: number;
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  onLogout: () => void;
  isStaff?: boolean;
  profileLabel: string;
  languageLabel: string;
  signOutLabel: string;
  adminLabel: string;
}

export function UserMenu({
  user,
  userInitial,
  pendingInvitesCount,
  currentLang,
  onLanguageChange,
  onLogout,
  isStaff,
  profileLabel,
  languageLabel,
  signOutLabel,
  adminLabel,
}: UserMenuProps) {
  const navigate = useNavigate();

  return (
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
          <span className="flex-1">{profileLabel}</span>
          {pendingInvitesCount > 0 && (
            <span className="flex items-center justify-center min-w-5 h-5 rounded-full bg-primary text-background text-[10px] font-bold px-1">
              {pendingInvitesCount}
            </span>
          )}
        </DropdownMenuItem>

        {isStaff && (
          <DropdownMenuItem onClick={() => navigate(routes.admin.overview())}>
            <ShieldCheck className="h-4 w-4 mr-2" />
            {adminLabel}
          </DropdownMenuItem>
        )}

        {/* Language switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Languages className="h-4 w-4 mr-2" />
              <span className="flex-1">{languageLabel}</span>
              <span className="text-xs text-muted-foreground">{languages[currentLang]}</span>
            </DropdownMenuItem>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            {(Object.entries(languages) as [Language, string][]).map(([code, label]) => (
              <DropdownMenuItem
                key={code}
                onClick={() => onLanguageChange(code)}
                className={currentLang === code ? 'bg-accent' : ''}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          {signOutLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
