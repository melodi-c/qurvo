import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDashboardStore } from '../store';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TextTileDialog.translations';

interface TextTileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TextTileDialog({ open, onClose }: TextTileDialogProps) {
  const addTextTile = useDashboardStore((s) => s.addTextTile);
  const [content, setContent] = useState('');
  const { t } = useLocalTranslation(translations);

  const handleAdd = () => {
    const trimmed = content.trim();
    if (!trimmed) {return;}
    addTextTile(trimmed);
    setContent('');
    onClose();
  };

  const handleClose = () => {
    setContent('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <textarea
          className="w-full h-32 rounded-lg border border-border bg-transparent px-3 py-2 text-sm
                     placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          placeholder={t('placeholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          autoFocus
        />

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            {t('cancel')}
          </Button>
          <Button onClick={handleAdd} disabled={!content.trim()}>
            {t('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
