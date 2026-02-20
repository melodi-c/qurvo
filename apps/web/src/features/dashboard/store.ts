import { create } from 'zustand';
import type { Widget } from '@/api/generated/Api';

export interface RglItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  updateLayout: (layout: readonly RglItem[]) => void;
  addWidget: (widget: Widget) => void;
  removeWidget: (widgetId: string) => void;
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
    }),

  setEditing: (editing) => set({ isEditing: editing }),

  setLocalName: (name) => set({ localName: name, isDirty: true }),

  updateLayout: (layout) =>
    set((s) => ({
      localLayout: [...layout],
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
    })),

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
    }),

  markSaved: () => set({ isDirty: false }),
}));
