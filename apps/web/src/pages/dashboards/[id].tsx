import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useDashboard, useSaveDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { useDashboardStore } from '@/features/dashboard/store';
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';
import { DashboardFilterBar } from '@/features/dashboard/components/DashboardFilterBar';
import { DashboardGrid } from '@/features/dashboard/components/DashboardGrid';
import { EditModeToolbar } from '@/features/dashboard/components/EditModeToolbar';
import { AddWidgetDialog } from '@/features/dashboard/components/AddWidgetDialog';
import { TextTileDialog } from '@/features/dashboard/components/TextTileDialog';
import { SaveBar } from '@/features/dashboard/components/SaveBar';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './[id].translations';

export default function DashboardBuilderPage() {
  const { t } = useLocalTranslation(translations);
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const { data: dashboard, isLoading } = useDashboard(id!);
  const { save, isPending } = useSaveDashboard(id!);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showTextDialog, setShowTextDialog] = useState(false);

  const store = useDashboardStore();

  useEffect(() => {
    if (dashboard && !store.isEditing) {
      store.initSession(
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
  }, [dashboard, store.isEditing]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t('selectProject')}
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">{t('loading')}</div>;
  }

  if (!dashboard) {
    return <div className="text-muted-foreground text-sm">{t('notFound')}</div>;
  }

  const handleSave = async () => {
    // Merge layout positions back into widget objects, include text content
    const mergedWidgets = store.localWidgets.map((widget) => {
      const layoutItem = store.localLayout.find((l) => l.i === widget.id);
      const textContent = store.widgetMeta[widget.id]?.textContent;
      return {
        ...widget,
        layout: layoutItem
          ? { x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h }
          : widget.layout,
        content: textContent ?? widget.content ?? undefined,
      };
    });

    await save({
      name: store.localName,
      widgets: mergedWidgets,
      serverWidgets: dashboard.widgets || [],
    });
    store.markSaved();
    store.setEditing(false);
  };

  const handleDiscard = () => {
    store.cancelEditMode();
  };

  return (
    <div className={`space-y-4 ${store.isEditing && store.isDirty ? 'pb-32' : ''}`}>
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

      {store.isEditing && store.isDirty && (
        <SaveBar onSave={handleSave} onDiscard={handleDiscard} isSaving={isPending} />
      )}
    </div>
  );
}
