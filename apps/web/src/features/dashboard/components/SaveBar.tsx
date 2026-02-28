import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw } from 'lucide-react';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './SaveBar.translations';

/** Bottom offset for the fixed bar (1.5rem + safe-area) */
const BOTTOM_OFFSET_REM = 1.5;

interface SaveBarProps {
  onSave: () => void;
  onDiscard: () => void;
  isSaving: boolean;
}

export function SaveBar({ onSave, onDiscard, isSaving }: SaveBarProps) {
  const { t } = useLocalTranslation(translations);
  const barRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(80);

  useEffect(() => {
    const el = barRef.current;
    if (!el) {return;}

    const update = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setSpacerHeight(el.offsetHeight + BOTTOM_OFFSET_REM * rem + rem);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Invisible spacer so content is not hidden behind the fixed bar */}
      <div style={{ height: spacerHeight }} aria-hidden />

      <div
        ref={barRef}
        className="fixed left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 bg-card border border-border rounded-xl shadow-2xl px-4 py-3">
          <span className="text-sm text-muted-foreground">{t('unsavedChanges')}</span>
          <div className="hidden sm:block w-px h-4 bg-border" />
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={isSaving}>
            <RotateCcw className="h-3 w-3 mr-1" />
            {t('discard')}
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            <Save className="h-3 w-3 mr-1" />
            {isSaving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </>
  );
}
