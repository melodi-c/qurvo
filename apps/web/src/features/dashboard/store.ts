import { create } from 'zustand';
import type { Widget } from '@/api/generated/Api';
import { type DashboardFilterOverrides, EMPTY_OVERRIDES } from './lib/filter-overrides';
import { computeAutoLayout } from './lib/auto-layout';

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
  exitEditModeAfterSave: () => void;
  setLocalName: (name: string) => void;
  updateLayout: (layout: readonly RglItem[]) => void;
  addWidget: (widget: Widget) => void;
  duplicateWidget: (widgetId: string) => void;
  removeWidget: (widgetId: string) => void;
  markSaved: () => void;

  // New actions
  enterEditMode: () => void;
  cancelEditMode: (forDashboardId?: string) => void;
  setFilterOverrides: (overrides: Partial<Omit<DashboardFilterOverrides, 'propertyFilters'>>) => void;
  setPropertyFilters: (filters: DashboardFilterOverrides['propertyFilters']) => void;
  clearFilterOverrides: () => void;
  setWidgetMeta: (widgetId: string, meta: Partial<LocalWidgetMeta>) => void;
  autoLayout: () => void;
  addTextTile: (content: string) => void;
  replaceWidgetId: (oldId: string, newId: string) => void;
  focusedTextTile: string | null;
  requestTextFocus: (widgetId: string) => void;
  clearTextFocus: () => void;
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
  focusedTextTile: null,

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

  exitEditModeAfterSave: () => set({ isEditing: false, isDirty: false, snapshot: null }),

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

  duplicateWidget: (widgetId) =>
    set((s) => {
      const source = s.localWidgets.find((w) => w.id === widgetId);
      const sourceLayout = s.localLayout.find((l) => l.i === widgetId);
      if (!source || !sourceLayout) {return s;}

      const newId = crypto.randomUUID();
      const maxY = s.localLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const clone: Widget = {
        ...source,
        id: newId,
        layout: { ...source.layout, y: maxY },
      };
      const meta = s.widgetMeta[widgetId];
      return {
        localWidgets: [...s.localWidgets, clone],
        localLayout: [
          ...s.localLayout,
          { i: newId, x: sourceLayout.x, y: maxY, w: sourceLayout.w, h: sourceLayout.h },
        ],
        widgetMeta: meta
          ? { ...s.widgetMeta, [newId]: { ...meta } }
          : s.widgetMeta,
        isDirty: true,
      };
    }),

  removeWidget: (widgetId) =>
    set((s) => ({
      localWidgets: s.localWidgets.filter((w) => w.id !== widgetId),
      localLayout: s.localLayout.filter((l) => l.i !== widgetId),
      widgetMeta: Object.fromEntries(
        Object.entries(s.widgetMeta).filter(([k]) => k !== widgetId),
      ),
      isDirty: true,
    })),

  markSaved: () => set({ isDirty: false }),

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

  cancelEditMode: (forDashboardId?: string) =>
    set((s) => {
      // Guard: if called for a specific dashboard (e.g. from cleanup effect)
      // but the store already moved to a different dashboard, skip restore.
      if (forDashboardId && s.dashboardId !== forDashboardId) {
        return {};
      }
      if (!s.snapshot) {return { isEditing: false, isDirty: false, filterOverrides: EMPTY_OVERRIDES };}
      return {
        isEditing: false,
        isDirty: false,
        localWidgets: s.snapshot.widgets,
        localLayout: s.snapshot.layout,
        localName: s.snapshot.name,
        widgetMeta: s.snapshot.widgetMeta,
        snapshot: null,
        filterOverrides: EMPTY_OVERRIDES,
      };
    }),

  setFilterOverrides: (overrides) =>
    set((s) => ({
      filterOverrides: { ...s.filterOverrides, ...overrides },
    })),

  setPropertyFilters: (filters) =>
    set((s) => ({
      filterOverrides: { ...s.filterOverrides, propertyFilters: filters },
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

  requestTextFocus: (widgetId) => set({ focusedTextTile: widgetId }),
  clearTextFocus: () => set({ focusedTextTile: null }),

  autoLayout: () =>
    set((s) => ({
      localLayout: computeAutoLayout(s.localLayout),
      isDirty: true,
    })),

  replaceWidgetId: (oldId, newId) =>
    set((s) => ({
      localWidgets: s.localWidgets.map((w) =>
        w.id === oldId ? { ...w, id: newId } : w,
      ),
      localLayout: s.localLayout.map((l) =>
        l.i === oldId ? { ...l, i: newId } : l,
      ),
      widgetMeta: Object.fromEntries(
        Object.entries(s.widgetMeta).map(([k, v]) =>
          k === oldId ? [newId, v] : [k, v],
        ),
      ),
      // Also update the snapshot so that cancelEditMode reflects the server IDs
      snapshot: s.snapshot
        ? {
            ...s.snapshot,
            widgets: s.snapshot.widgets.map((w) =>
              w.id === oldId ? { ...w, id: newId } : w,
            ),
            layout: s.snapshot.layout.map((l) =>
              l.i === oldId ? { ...l, i: newId } : l,
            ),
            widgetMeta: Object.fromEntries(
              Object.entries(s.snapshot.widgetMeta).map(([k, v]) =>
                k === oldId ? [newId, v] : [k, v],
              ),
            ),
          }
        : null,
    })),

  addTextTile: (content) =>
    set((s) => {
      const id = `text-${crypto.randomUUID()}`;
      const maxY = s.localLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const layout = { x: 0, y: maxY, w: 6, h: 2 };
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
