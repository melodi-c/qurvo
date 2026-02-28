import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useProjectId } from '@/hooks/use-project-id';
import { useDashboardStore } from '../store';
import type { CreateWidget, Widget } from '@/api/generated/Api';

export function useDashboardList() {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['dashboards', projectId],
    queryFn: () => api.dashboardsControllerList({ projectId }),
    enabled: !!projectId,
  });
}

export function useDashboard(dashboardId: string) {
  const projectId = useProjectId();
  return useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => api.dashboardsControllerGetById({ projectId, dashboardId }),
    enabled: !!dashboardId && !!projectId,
  });
}

export function useCreateDashboard() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.dashboardsControllerCreate({ projectId }, { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboards', projectId] });
    },
  });
}

export function useDeleteDashboard() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dashboardId: string) =>
      api.dashboardsControllerRemove({ projectId, dashboardId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboards', projectId] });
    },
  });
}

export function useUpdateDashboardName() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, name }: { dashboardId: string; name: string }) =>
      api.dashboardsControllerUpdate({ projectId, dashboardId }, { name }),
    onSuccess: (_data, { dashboardId }) => {
      void qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    },
  });
}

export function useAddWidget() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dashboardId,
      widget,
    }: {
      dashboardId: string;
      widget: CreateWidget;
    }) => api.dashboardsControllerAddWidget({ projectId, dashboardId }, widget),
    onSuccess: (_data, { dashboardId }) => {
      void qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    },
  });
}

export function useRemoveWidget() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, widgetId }: { dashboardId: string; widgetId: string }) =>
      api.dashboardsControllerRemoveWidget({ projectId, dashboardId, widgetId }),
    onSuccess: (_data, { dashboardId }) => {
      void qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    },
  });
}

/** Saves the entire dashboard state: name + widget layouts.
 *  Operations run sequentially (add → update → remove) so that a failure
 *  in an earlier phase does not leave the dashboard in an inconsistent state
 *  (e.g. widgets removed but new ones not yet created).
 *  On any error the query cache is invalidated to re-sync with the server. */
export function useSaveDashboard(dashboardId: string) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const updateName = useMutation({
    mutationFn: (name: string) =>
      api.dashboardsControllerUpdate({ projectId, dashboardId }, { name }),
  });
  const addWidget = useMutation({
    mutationFn: (w: Widget) =>
      api.dashboardsControllerAddWidget({ projectId, dashboardId }, {
        insight_id: w.insight_id ?? undefined,
        layout: w.layout,
        content: w.content ?? undefined,
      }),
  });
  const updateWidget = useMutation({
    mutationFn: (w: Widget) =>
      api.dashboardsControllerUpdateWidget({ projectId, dashboardId, widgetId: w.id }, {
        layout: w.layout,
        content: w.content ?? undefined,
      }),
  });
  const removeWidget = useMutation({
    mutationFn: (widgetId: string) =>
      api.dashboardsControllerRemoveWidget({ projectId, dashboardId, widgetId }),
  });

  const save = async (params: { name: string; widgets: Widget[]; serverWidgets: Widget[] }) => {
    const { name, widgets, serverWidgets } = params;

    const serverIds = new Set(serverWidgets.map((w) => w.id));
    const localIds = new Set(widgets.map((w) => w.id));

    const toAdd = widgets.filter((w) => !serverIds.has(w.id));
    const toUpdate = widgets.filter((w) => serverIds.has(w.id));
    const toRemove = serverWidgets.filter((w) => !localIds.has(w.id));

    try {
      // 1. Update dashboard name
      await updateName.mutateAsync(name);

      // 2. Add new widgets first — safest to do before removals.
      //    Replace local temp IDs with server-assigned IDs so that a retry
      //    after partial failure does not duplicate already-created widgets.
      for (const w of toAdd) {
        const created = await addWidget.mutateAsync(w);
        if (created.id !== w.id) {
          useDashboardStore.getState().replaceWidgetId(w.id, created.id);
        }
      }

      // 3. Update existing widgets
      for (const w of toUpdate) {
        await updateWidget.mutateAsync(w);
      }

      // 4. Remove deleted widgets last — minimises data loss on partial failure
      for (const w of toRemove) {
        await removeWidget.mutateAsync(w.id);
      }

      void qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    } catch (err) {
      // Re-sync with server state so the UI is not stale
      void qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      throw err;
    }
  };

  return {
    save,
    isPending: updateName.isPending || addWidget.isPending || updateWidget.isPending || removeWidget.isPending,
  };
}
