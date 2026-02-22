import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useDashboardStore } from '../store';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './DashboardHeader.translations';

export function DashboardHeader() {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const localName = useDashboardStore((s) => s.localName);
  const setLocalName = useDashboardStore((s) => s.setLocalName);
  const enterEditMode = useDashboardStore((s) => s.enterEditMode);
  const cancelEditMode = useDashboardStore((s) => s.cancelEditMode);
  const { t } = useLocalTranslation(translations);

  return (
    <PageHeader
      title={
        isEditing ? (
          <Input
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            className="text-base font-semibold h-auto py-1"
          />
        ) : (
          <h1 className="text-base font-semibold truncate">{localName}</h1>
        )
      }
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant={isEditing ? 'secondary' : 'outline'}
          onClick={() => (isEditing ? cancelEditMode() : enterEditMode())}
        >
          {isEditing ? (
            <>
              <X className="h-4 w-4 mr-2" />
              {t('cancel')}
            </>
          ) : (
            <>
              <Pencil className="h-4 w-4 mr-2" />
              {t('edit')}
            </>
          )}
        </Button>
      </div>
    </PageHeader>
  );
}
