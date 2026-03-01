import { useState, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './MobileQueryPanelToggle.translations';

interface MobileQueryPanelToggleProps {
  /** Query panel content to show/hide on mobile */
  children: ReactNode;
  /** Optional extra content rendered next to the toggle button when panel is open (e.g. a "Results ready" badge) */
  extraToolbar?: ReactNode;
}

/**
 * Mobile toggle for query panel visibility.
 * On desktop (lg+), children are always visible via `lg:contents`.
 * On mobile, a toggle button shows/hides the query panel.
 */
export function MobileQueryPanelToggle({ children, extraToolbar }: MobileQueryPanelToggleProps) {
  const { t } = useLocalTranslation(translations);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden border-b border-border px-4 py-2 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1.5"
          onClick={() => setPanelOpen((prev) => !prev)}
        >
          {panelOpen ? (
            <>
              <X className="h-4 w-4" />
              {t('hideSettings')}
            </>
          ) : (
            <>
              <SlidersHorizontal className="h-4 w-4" />
              {t('settings')}
            </>
          )}
        </Button>
        {panelOpen && extraToolbar}
      </div>
      <div className={cn(panelOpen ? 'block' : 'hidden', 'lg:contents')}>
        {children}
      </div>
    </>
  );
}
