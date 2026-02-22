import { create } from 'zustand';
import type { Widget } from '@/api/generated/Api';
import { type DashboardFilterOverrides, EMPTY_OVERRIDES } from './lib/filter-overrides';

export interface RglItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LocalWidgetMeta {
  textContent?: string;
}

interface Snapshot {
  widgets: Widget[];
  layout: RglItem[];
  name: string;
  widgetMeta: Record<string, LocalWidgetMeta>;
}

interface DashboardStore {
  dashboardId: string | null;
  isEditing: boolean;
  isDirty: boolean;
  localWidgets: Widget[];
  localLayout: RglItem[];
  localName: string;
  filterOverrides: DashboardFilterOverrides;
  widgetMeta: Record<string, LocalWidgetMeta>;
  snapshot: Snapshot | null;

  initSession: (id: string, name: string, widgets: Widget[]) => void;
  setEditing: (editing: boolean) => void;
  setLocalName: (name: string) => void;
  updateLayout: (layout: readonly RglItem[]) => void;
  addWidget: (widget: Widget) => void;
  removeWidget: (widgetId: string) => void;
  markSaved: () => void;

  // New actions
  enterEditMode: () => void;
  cancelEditMode: () => void;
  setFilterOverrides: (overrides: Partial<DashboardFilterOverrides>) => void;
  clearFilterOverrides: () => void;
  setWidgetMeta: (widgetId: string, meta: Partial<LocalWidgetMeta>) => void;
  addTextTile: (content: string) => void;
}

function widgetsToLayout(widgets: Widget[]): RglItem[] {
  return widgets.map((w) => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
  }));
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  dashboardId: null,
  isEditing: false,
  isDirty: false,
  localWidgets: [],
  localLayout: [],
  localName: '',
  filterOverrides: EMPTY_OVERRIDES,
  widgetMeta: {},
  snapshot: null,

  initSession: (id, name, widgets) => {
    // Hydrate widgetMeta from server content field for text tiles
    const meta: Record<string, LocalWidgetMeta> = {};
    for (const w of widgets) {
      if (w.content) {
        meta[w.id] = { textContent: w.content };
      }
    }
    set({
      dashboardId: id,
      localName: name,
      localWidgets: widgets,
      localLayout: widgetsToLayout(widgets),
      isDirty: false,
      isEditing: false,
      filterOverrides: EMPTY_OVERRIDES,
      widgetMeta: meta,
      snapshot: null,
    });
  },

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
      widgetMeta: Object.fromEntries(
        Object.entries(s.widgetMeta).filter(([k]) => k !== widgetId),
      ),
      isDirty: true,
    })),

  markSaved: () => set({ isDirty: false, snapshot: null }),

  enterEditMode: () =>
    set((s) => ({
      isEditing: true,
      snapshot: {
        widgets: s.localWidgets,
        layout: s.localLayout,
        name: s.localName,
        widgetMeta: s.widgetMeta,
      },
    })),

  cancelEditMode: () =>
    set((s) => {
      if (!s.snapshot) return { isEditing: false, isDirty: false };
      return {
        isEditing: false,
        isDirty: false,
        localWidgets: s.snapshot.widgets,
        localLayout: s.snapshot.layout,
        localName: s.snapshot.name,
        widgetMeta: s.snapshot.widgetMeta,
        snapshot: null,
      };
    }),

  setFilterOverrides: (overrides) =>
    set((s) => ({
      filterOverrides: { ...s.filterOverrides, ...overrides },
    })),

  clearFilterOverrides: () =>
    set({ filterOverrides: EMPTY_OVERRIDES }),

  setWidgetMeta: (widgetId, meta) =>
    set((s) => ({
      widgetMeta: {
        ...s.widgetMeta,
        [widgetId]: { ...s.widgetMeta[widgetId], ...meta },
      },
      isDirty: true,
    })),

  addTextTile: (content) =>
    set((s) => {
      const id = `text-${crypto.randomUUID()}`;
      const maxY = s.localLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const layout = { x: 0, y: maxY, w: 3, h: 2 };
      const newWidget: Widget = {
        id,
        dashboard_id: s.dashboardId ?? '',
        insight_id: null,
        insight: null,
        layout,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return {
        localWidgets: [...s.localWidgets, newWidget],
        localLayout: [...s.localLayout, { i: id, ...layout }],
        widgetMeta: { ...s.widgetMeta, [id]: { textContent: content } },
        isDirty: true,
      };
    }),
}));
