import { useEffect, useRef, type ElementType } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QurvoLogo } from '@/components/qurvo-logo';

interface SidebarSection {
  title: string;
  items: { path: string; label: string; icon: ElementType; exact?: boolean }[];
}

interface SidebarNavProps {
  isOpen: boolean;
  onClose: () => void;
  logoHref: string;
  hasProjects: boolean;
  sections: SidebarSection[];
  isActive: (path: string, exact?: boolean) => boolean;
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
  const sidebarRef = useRef<HTMLElement>(null);

  // Focus trap: cycle Tab within sidebar when open on mobile
  useEffect(() => {
    if (!isOpen) return;

    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // Move focus into sidebar on open
    const firstFocusable = sidebar.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <aside
      ref={sidebarRef}
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
        size="icon"
        onClick={onClose}
        className="lg:hidden absolute top-2 right-2 z-10"
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
                      isActive(item.path, item.exact)
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
