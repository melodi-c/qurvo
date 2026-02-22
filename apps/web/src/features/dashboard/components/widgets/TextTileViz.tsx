import { useEffect, useRef } from 'react';
import { useDashboardStore } from '../../store';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TextTileViz.translations';

interface TextTileVizProps {
  widgetId: string;
  content: string;
  isEditing: boolean;
}

export function TextTileViz({ widgetId, content, isEditing }: TextTileVizProps) {
  const setWidgetMeta = useDashboardStore((s) => s.setWidgetMeta);
  const focusedTextTile = useDashboardStore((s) => s.focusedTextTile);
  const clearTextFocus = useDashboardStore((s) => s.clearTextFocus);
  const { t } = useLocalTranslation(translations);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusedTextTile === widgetId && textareaRef.current) {
      textareaRef.current.focus();
      clearTextFocus();
    }
  }, [focusedTextTile, widgetId, clearTextFocus]);

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className="drag-cancel w-full h-full resize-none bg-transparent text-sm text-foreground
                   placeholder:text-muted-foreground focus:outline-none"
        placeholder={t('placeholder')}
        value={content}
        onChange={(e) => setWidgetMeta(widgetId, { textContent: e.target.value })}
      />
    );
  }

  if (!content) {
    return (
      <p className="text-muted-foreground/50 text-sm italic h-full flex items-center justify-center">
        {t('empty')}
      </p>
    );
  }

  return (
    <div className="h-full overflow-auto text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
      {content}
    </div>
  );
}
