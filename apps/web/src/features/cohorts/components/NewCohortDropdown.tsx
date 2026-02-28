import { useState } from 'react';
import { Plus, UsersRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useCreateStaticCohort } from '@/features/cohorts/hooks/use-cohorts';
import { extractApiErrorMessage } from '@/lib/utils';
import translations from './NewCohortDropdown.translations';

export function NewCohortDropdown() {
  const { go, link } = useAppNavigate();
  const { t } = useLocalTranslation(translations);
  const createStaticMutation = useCreateStaticCohort();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleOpenDialog = () => {
    setName('');
    setDescription('');
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {return;}
    try {
      const cohort = await createStaticMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success(t('created'));
      setDialogOpen(false);
      go.cohorts.detail(cohort.id);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('createFailed')));
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('newCohort')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t('chooseType')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => go.cohorts.new()}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <span className="flex items-center gap-2 font-medium text-sm">
              <UsersRound className="h-4 w-4" />
              {t('dynamicCohort')}
            </span>
            <span className="text-xs text-muted-foreground pl-6">{t('dynamicCohortDesc')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleOpenDialog}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <span className="flex items-center gap-2 font-medium text-sm">
              <Users className="h-4 w-4" />
              {t('staticCohort')}
            </span>
            <span className="text-xs text-muted-foreground pl-6">{t('staticCohortDesc')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dialogTitle')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="static-cohort-name">{t('nameLabel')}</Label>
              <Input
                id="static-cohort-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) {
                    handleCreate();
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="static-cohort-description">{t('descriptionLabel')}</Label>
              <Input
                id="static-cohort-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createStaticMutation.isPending}
            >
              {createStaticMutation.isPending ? t('creating') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
