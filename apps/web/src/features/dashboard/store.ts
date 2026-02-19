import { create } from 'zustand';
import type { Widget, RglItem, FunnelWidgetConfig } from './types';

interface DashboardStore {
  dashboardId: string | null;
  isEditing: boolean;
  isDirty: boolean;
  localWidgets: Widget[];
  localLayout: RglItem[];
  localName: string;

  initSession: (id: string, name: string, widgets: Widget[]) => void;
  setEditing: (editing: boolean) => void;
  setLocalName: (name: string) => void;
  updateLayout: (layout: RglItem[]) => void;
  addWidget: (widget: Widget) => void;
  removeWidget: (widgetId: string) => void;
  updateWidgetConfig: (widgetId: string, config: FunnelWidgetConfig, name: string) => void;
  setEditingWidget: (widgetId: string | null) => void;
  editingWidgetId: string | null;
  discardChanges: (serverWidgets: Widget[], serverName: string) => void;
  markSaved: () => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  dashboardId: null,
  isEditing: false,
  isDirty: false,
  localWidgets: [],
  localLayout: [],
  localName: '',
  editingWidgetId: null,

  initSession: (id, name, widgets) =>
    set({
      dashboardId: id,
      localName: name,
      localWidgets: widgets,
      localLayout: widgets.map((w) => ({
        i: w.id,
        x: w.layout.x,
        y: w.layout.y,
        w: w.layout.w,
        h: w.layout.h,
      })),
      isDirty: false,
      isEditing: false,
      editingWidgetId: null,
    }),

  setEditing: (editing) => set({ isEditing: editing }),

  setLocalName: (name) => set({ localName: name, isDirty: true }),

  updateLayout: (layout) =>
    set((s) => ({
      localLayout: layout,
      isDirty: s.isEditing ? true : s.isDirty,
    })),

  addWidget: (widget) =>
    set((s) => ({
      localWidgets: [...s.localWidgets, widget],
      localLayout: [
        ...s.localLayout,
        { i: widget.id, x: widget.layout.x, y: widget.layout.y, w: widget.layout.w, h: widget.layout.h },
      ],
      isDirty: true,
    })),

  removeWidget: (widgetId) =>
    set((s) => ({
      localWidgets: s.localWidgets.filter((w) => w.id !== widgetId),
      localLayout: s.localLayout.filter((l) => l.i !== widgetId),
      isDirty: true,
      editingWidgetId: s.editingWidgetId === widgetId ? null : s.editingWidgetId,
    })),

  updateWidgetConfig: (widgetId, config, name) =>
    set((s) => ({
      localWidgets: s.localWidgets.map((w) => (w.id === widgetId ? { ...w, config, name } : w)),
      isDirty: true,
      editingWidgetId: null,
    })),

  setEditingWidget: (widgetId) => set({ editingWidgetId: widgetId }),

  discardChanges: (serverWidgets, serverName) =>
    set({
      localWidgets: serverWidgets,
      localName: serverName,
      localLayout: serverWidgets.map((w) => ({
        i: w.id,
        x: w.layout.x,
        y: w.layout.y,
        w: w.layout.w,
        h: w.layout.h,
      })),
      isDirty: false,
      editingWidgetId: null,
    }),

  markSaved: () => set({ isDirty: false }),
}));
