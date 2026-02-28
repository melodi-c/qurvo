import { useState } from 'react';
import { Pencil, X, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ShareDialog } from '@/components/ui/share-dialog';
import { useDashboardStore } from '../store';
import { useProjectId } from '@/hooks/use-project-id';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './DashboardHeader.translations';

export function DashboardHeader() {
  const isEditing = useDashboardStore((s) => s.isEditing);
  const localName = useDashboardStore((s) => s.localName);
  const dashboardId = useDashboardStore((s) => s.dashboardId);
  const setLocalName = useDashboardStore((s) => s.setLocalName);
  const enterEditMode = useDashboardStore((s) => s.enterEditMode);
  const cancelEditMode = useDashboardStore((s) => s.cancelEditMode);
  const projectId = useProjectId();
  const { t } = useLocalTranslation(translations);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={
          isEditing ? (
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              aria-label={t('dashboardName')}
              className="text-base font-semibold h-auto py-1"
            />
          ) : (
            <h1 className="text-base font-semibold truncate">{localName}</h1>
          )
        }
      >
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isEditing && dashboardId && (
            <Button variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4 mr-2" />
              {t('share')}
            </Button>
          )}
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

      {dashboardId && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          resourceType="dashboard"
          resourceId={dashboardId}
          projectId={projectId}
        />
      )}
    </>
  );
}
