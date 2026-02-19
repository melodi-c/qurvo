import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, X } from 'lucide-react';
import { useDashboard, useSaveDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { useDashboardStore } from '@/features/dashboard/store';
import { DashboardGrid } from '@/features/dashboard/components/DashboardGrid';
import { AddWidgetDialog } from '@/features/dashboard/components/AddWidgetDialog';
import { SaveBar } from '@/features/dashboard/components/SaveBar';
import type { Widget } from '@/api/generated/Api';

export default function DashboardBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || '';
  const { data: dashboard, isLoading } = useDashboard(id!);
  const { save, isPending } = useSaveDashboard(id!);
  const [showAddWidget, setShowAddWidget] = useState(false);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a project first
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading dashboard...</div>;
  }

  if (!dashboard) {
    return <div className="text-muted-foreground text-sm">Dashboard not found</div>;
  }

  const handleSave = async () => {
    // Merge layout positions back into widget objects
    const mergedWidgets: Widget[] = store.localWidgets.map((widget) => {
      const layoutItem = store.localLayout.find((l) => l.i === widget.id);
      return layoutItem
        ? {
            ...widget,
            layout: { x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h },
          }
        : widget;
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
    store.discardChanges(
      dashboard.widgets || [],
      dashboard.name,
    );
    store.setEditing(false);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {store.isEditing ? (
            <Input
              value={store.localName}
              onChange={(e) => store.setLocalName(e.target.value)}
              className="text-xl font-bold h-auto py-1"
            />
          ) : (
            <h1 className="text-2xl font-bold truncate">{store.localName}</h1>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {store.isEditing && (
            <Button onClick={() => setShowAddWidget(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Widget
            </Button>
          )}
          <Button
            variant={store.isEditing ? 'secondary' : 'outline'}
            onClick={() => store.setEditing(!store.isEditing)}
          >
            {store.isEditing ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <DashboardGrid />

      {/* Add Widget Dialog */}
      <AddWidgetDialog open={showAddWidget} onClose={() => setShowAddWidget(false)} />

      {/* Save Bar */}
      {store.isEditing && store.isDirty && (
        <SaveBar onSave={handleSave} onDiscard={handleDiscard} isSaving={isPending} />
      )}
    </div>
  );
}
