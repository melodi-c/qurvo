import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { useDashboard, useSaveDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { useDashboardStore } from '@/features/dashboard/store';
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';
import { DashboardFilterBar } from '@/features/dashboard/components/DashboardFilterBar';
import { DashboardGrid } from '@/features/dashboard/components/DashboardGrid';
import { EditModeToolbar } from '@/features/dashboard/components/EditModeToolbar';
import { AddWidgetDialog } from '@/features/dashboard/components/AddWidgetDialog';
import { TextTileDialog } from '@/features/dashboard/components/TextTileDialog';
import { SaveBar } from '@/features/dashboard/components/SaveBar';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/grid-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { RequireProject } from '@/components/require-project';
import { useAppNavigate } from '@/hooks/use-app-navigate';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './[id].translations';

export default function DashboardBuilderPage() {
  const { t } = useLocalTranslation(translations);
  const { go } = useAppNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: dashboard, isLoading } = useDashboard(id!);
  const { save, isPending } = useSaveDashboard(id!);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showTextDialog, setShowTextDialog] = useState(false);

  const isEditing = useDashboardStore((s) => s.isEditing);
  const isDirty = useDashboardStore((s) => s.isDirty);
  const initSession = useDashboardStore((s) => s.initSession);
  const exitEditModeAfterSave = useDashboardStore((s) => s.exitEditModeAfterSave);
  const cancelEditMode = useDashboardStore((s) => s.cancelEditMode);

  useEffect(() => {
    if (dashboard && !isEditing) {
      initSession(
        dashboard.id,
        dashboard.name,
        dashboard.widgets || [],
      );
    }
  // Re-init when fresh server data arrives (e.g. after widget editor saves),
  // but not while the user is actively editing in-place.
  // Also re-run when isEditing changes to false (e.g. after save) so that
  // fresh server data is picked up even if the refetch completed during editing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard, isEditing]);

  // Reset edit mode when navigating away so that returning to this dashboard
  // (or visiting another) does not leave stale dirty/editing state in the store.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelEditMode(), []);

  const handleSave = async () => {
    // Read latest state imperatively — avoids subscribing to frequent layout/widget updates
    const { localWidgets, localLayout, localName, widgetMeta } = useDashboardStore.getState();

    // Merge layout positions back into widget objects, include text content
    const mergedWidgets = localWidgets.map((widget) => {
      const layoutItem = localLayout.find((l) => l.i === widget.id);
      const textContent = widgetMeta[widget.id]?.textContent;
      return {
        ...widget,
        layout: layoutItem
          ? { x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h }
          : widget.layout,
        content: textContent ?? widget.content ?? undefined,
      };
    });

    await save({
      name: localName,
      widgets: mergedWidgets,
      serverWidgets: dashboard?.widgets || [],
    });
    exitEditModeAfterSave();
  };

  const handleDiscard = () => {
    cancelEditMode();
  };

  return (
    <RequireProject description={t('selectProject')}>
      {isLoading && <GridSkeleton />}

      {!isLoading && !dashboard && (
        <EmptyState
          icon={LayoutDashboard}
          title={t('notFound')}
          description={t('notFoundDescription')}
          action={
            <Button variant="outline" onClick={() => go.dashboards.list()}>
              {t('backToDashboards')}
            </Button>
          }
        />
      )}

      {!isLoading && dashboard && (
        <div className={`space-y-4 ${isEditing && isDirty ? 'pb-32' : ''}`}>
          <DashboardHeader />

          <DashboardFilterBar />

          <DashboardGrid
            onAddInsight={() => setShowAddWidget(true)}
            onAddText={() => setShowTextDialog(true)}
          />

          <EditModeToolbar
            onAddInsight={() => setShowAddWidget(true)}
            onAddText={() => setShowTextDialog(true)}
          />

          <AddWidgetDialog open={showAddWidget} onClose={() => setShowAddWidget(false)} />
          <TextTileDialog open={showTextDialog} onClose={() => setShowTextDialog(false)} />

          {isEditing && isDirty && (
            <SaveBar onSave={handleSave} onDiscard={handleDiscard} isSaving={isPending} />
          )}
        </div>
      )}
    </RequireProject>
  );
}
