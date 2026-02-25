import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QurvoLogo } from '@/components/qurvo-logo';
import type { ElementType } from 'react';

interface SidebarSection {
  title: string;
  items: { path: string; label: string; icon: ElementType }[];
}

interface SidebarNavProps {
  isOpen: boolean;
  onClose: () => void;
  logoHref: string;
  hasProjects: boolean;
  sections: SidebarSection[];
  isActive: (path: string) => boolean;
  navLink: (path: string) => string;
  navigationLabel: string;
  closeNavLabel: string;
  children: React.ReactNode;
}

export function SidebarNav({
  isOpen,
  onClose,
  logoHref,
  hasProjects,
  sections,
  isActive,
  navLink,
  navigationLabel,
  closeNavLabel,
  children,
}: SidebarNavProps) {
  return (
    <aside
      role={isOpen ? 'dialog' : undefined}
      aria-modal={isOpen ? true : undefined}
      aria-label={navigationLabel}
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-[220px] flex flex-col border-r border-border bg-sidebar',
        'transition-transform duration-200 ease-in-out',
        'lg:static lg:z-auto lg:translate-x-0 lg:shrink-0 lg:transition-none',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Close button -- mobile only */}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onClose}
        className="lg:hidden absolute top-3 right-3 z-10"
        aria-label={closeNavLabel}
      >
        <X className="w-4 h-4" />
      </Button>

      {/* Logo */}
      <Link
        to={logoHref}
        className="h-[var(--topbar-height)] flex items-center gap-2.5 px-4 border-b border-border hover:bg-accent/30 transition-colors"
      >
        <QurvoLogo className="w-5 h-5 text-primary shrink-0" />
        <span className="text-sm font-semibold tracking-tight">Qurvo</span>
      </Link>

      {/* Nav groups -- hidden when no projects */}
      {hasProjects && (
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {sections.map((section) => (
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

      {/* Bottom: project switcher + user menu */}
      <div className="border-t border-border p-2 space-y-1">{children}</div>
    </aside>
  );
}
