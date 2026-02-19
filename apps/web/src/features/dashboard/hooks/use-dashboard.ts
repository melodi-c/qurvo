import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import type { CreateWidget, UpdateWidget } from '@/api/generated/Api';
import type { Widget } from '@/api/generated/Api';

function useProjectId() {
  const [searchParams] = useSearchParams();
  return searchParams.get('project') || '';
}

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
      qc.invalidateQueries({ queryKey: ['dashboards', projectId] });
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
      qc.invalidateQueries({ queryKey: ['dashboards', projectId] });
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
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
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
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    },
  });
}

export function useUpdateWidget() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dashboardId,
      widgetId,
      patch,
    }: {
      dashboardId: string;
      widgetId: string;
      patch: UpdateWidget;
    }) => api.dashboardsControllerUpdateWidget({ projectId, dashboardId, widgetId }, patch),
    onSuccess: (_data, { dashboardId }) => {
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
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
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    },
  });
}

/** Saves the entire dashboard state: name + all widgets (config + layout). */
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
        type: w.type as 'funnel' | 'trend',
        name: w.name,
        config: w.config,
        layout: w.layout,
      }),
  });
  const updateWidget = useMutation({
    mutationFn: (w: Widget) =>
      api.dashboardsControllerUpdateWidget({ projectId, dashboardId, widgetId: w.id }, {
        name: w.name,
        config: w.config,
        layout: w.layout,
      }),
  });
  const removeWidget = useMutation({
    mutationFn: (widgetId: string) =>
      api.dashboardsControllerRemoveWidget({ projectId, dashboardId, widgetId }),
  });

  const save = async (params: { name: string; widgets: Widget[]; serverWidgets: Widget[] }) => {
    const { name, widgets, serverWidgets } = params;

    // 1. Update dashboard name
    await updateName.mutateAsync(name);

    const serverIds = new Set(serverWidgets.map((w) => w.id));
    const localIds = new Set(widgets.map((w) => w.id));

    // 2. Add new widgets (client-side temp IDs not in server)
    const toAdd = widgets.filter((w) => !serverIds.has(w.id));
    // 3. Update existing widgets
    const toUpdate = widgets.filter((w) => serverIds.has(w.id));
    // 4. Remove deleted widgets
    const toRemove = serverWidgets.filter((w) => !localIds.has(w.id));

    await Promise.all([
      ...toAdd.map((w) => addWidget.mutateAsync(w)),
      ...toUpdate.map((w) => updateWidget.mutateAsync(w)),
      ...toRemove.map((w) => removeWidget.mutateAsync(w.id)),
    ]);

    qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
  };

  return {
    save,
    isPending: updateName.isPending || addWidget.isPending || updateWidget.isPending || removeWidget.isPending,
  };
}
