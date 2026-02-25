import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { QurvoLogo } from '@/components/qurvo-logo';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './layout-topbar.translations';

interface LayoutTopbarProps {
  onMenuOpen: () => void;
  userInitial: string;
  logoHref: string;
}

export function LayoutTopbar({ onMenuOpen, userInitial, logoHref }: LayoutTopbarProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <header className="lg:hidden flex items-center gap-3 h-[var(--topbar-height)] px-4 border-b border-border bg-sidebar shrink-0">
      <button
        onClick={onMenuOpen}
        className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        aria-label={t('openNavigation')}
      >
        <Menu className="w-4 h-4" />
      </button>
      <Link to={logoHref} className="flex items-center gap-2 flex-1">
        <QurvoLogo className="w-5 h-5 text-primary shrink-0" />
        <span className="text-sm font-semibold tracking-tight">Qurvo</span>
      </Link>
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-[10px] font-bold text-primary shrink-0">
        {userInitial}
      </span>
    </header>
  );
}
