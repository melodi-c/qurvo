import { describe, it, expect, beforeEach } from 'vitest';
import { useDashboardStore } from './store';
import { EMPTY_OVERRIDES } from './lib/filter-overrides';
import type { Widget } from '@/api/generated/Api';

function makeWidget(id: string, dashboardId: string): Widget {
  return {
    id,
    dashboard_id: dashboardId,
    insight_id: null,
    insight: null,
    layout: { x: 0, y: 0, w: 6, h: 4 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('useDashboardStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useDashboardStore.setState({
      dashboardId: null,
      isEditing: false,
      isDirty: false,
      localWidgets: [],
      localLayout: [],
      localName: '',
      filterOverrides: EMPTY_OVERRIDES,
      widgetMeta: {},
      snapshot: null,
    });
  });

  describe('initSession with date range', () => {
    it('should initialize filterOverrides from date_from/date_to', () => {
      const widget = makeWidget('w-1', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widget], '-30d', '2026-03-02');

      const state = useDashboardStore.getState();
      expect(state.filterOverrides.dateFrom).toBe('-30d');
      expect(state.filterOverrides.dateTo).toBe('2026-03-02');
    });

    it('should set filterOverrides to null/null when no dates provided', () => {
      const widget = makeWidget('w-1', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widget]);

      const state = useDashboardStore.getState();
      expect(state.filterOverrides).toEqual(EMPTY_OVERRIDES);
    });

    it('should set filterOverrides to null/null when dates are null', () => {
      const widget = makeWidget('w-1', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widget], null, null);

      const state = useDashboardStore.getState();
      expect(state.filterOverrides).toEqual(EMPTY_OVERRIDES);
    });
  });

  describe('setDateRange', () => {
    it('should set isDirty to true when changing date range', () => {
      const widget = makeWidget('w-1', 'dash-a');
      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widget]);

      expect(useDashboardStore.getState().isDirty).toBe(false);

      useDashboardStore.getState().setDateRange('-7d', '2026-03-02');

      const state = useDashboardStore.getState();
      expect(state.isDirty).toBe(true);
      expect(state.filterOverrides.dateFrom).toBe('-7d');
      expect(state.filterOverrides.dateTo).toBe('2026-03-02');
    });

    it('should set isDirty when clearing date range to null', () => {
      const widget = makeWidget('w-1', 'dash-a');
      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widget], '-30d', '2026-03-02');

      useDashboardStore.getState().setDateRange(null, null);

      const state = useDashboardStore.getState();
      expect(state.isDirty).toBe(true);
      expect(state.filterOverrides).toEqual(EMPTY_OVERRIDES);
    });
  });

  describe('cancelEditMode', () => {
    it('should restore snapshot when cancelEditMode is called without dashboardId', () => {
      const widgetA = makeWidget('w-1', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widgetA]);
      useDashboardStore.getState().enterEditMode();
      useDashboardStore.getState().setLocalName('Dashboard A Modified');

      // Cancel without dashboardId — should always restore
      useDashboardStore.getState().cancelEditMode();

      const state = useDashboardStore.getState();
      expect(state.isEditing).toBe(false);
      expect(state.localName).toBe('Dashboard A');
      expect(state.snapshot).toBeNull();
    });

    it('should restore snapshot when cancelEditMode is called with matching dashboardId', () => {
      const widgetA = makeWidget('w-1', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widgetA]);
      useDashboardStore.getState().enterEditMode();
      useDashboardStore.getState().setLocalName('Dashboard A Modified');

      // Cancel with the same dashboardId — should restore
      useDashboardStore.getState().cancelEditMode('dash-a');

      const state = useDashboardStore.getState();
      expect(state.isEditing).toBe(false);
      expect(state.localName).toBe('Dashboard A');
      expect(state.snapshot).toBeNull();
    });

    it('should skip snapshot restore when cancelEditMode is called with stale dashboardId', () => {
      const widgetA = makeWidget('w-1', 'dash-a');
      const widgetB = makeWidget('w-2', 'dash-b');

      // Setup: Dashboard A in edit mode
      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widgetA]);
      useDashboardStore.getState().enterEditMode();
      useDashboardStore.getState().setLocalName('Dashboard A Modified');

      // Simulate fast navigation: initSession for Dashboard B runs first
      useDashboardStore.getState().initSession('dash-b', 'Dashboard B', [widgetB]);

      // Then cleanup effect for Dashboard A fires (stale cancelEditMode)
      useDashboardStore.getState().cancelEditMode('dash-a');

      // Dashboard B data should be preserved, NOT overwritten by Dashboard A's snapshot
      const state = useDashboardStore.getState();
      expect(state.dashboardId).toBe('dash-b');
      expect(state.localName).toBe('Dashboard B');
      expect(state.localWidgets).toHaveLength(1);
      expect(state.localWidgets[0].id).toBe('w-2');
    });

    it('should handle cancelEditMode when no snapshot exists', () => {
      const widgetA = makeWidget('w-1', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widgetA]);
      // Not in edit mode, no snapshot

      useDashboardStore.getState().cancelEditMode('dash-a');

      const state = useDashboardStore.getState();
      expect(state.isEditing).toBe(false);
      expect(state.isDirty).toBe(false);
      expect(state.localName).toBe('Dashboard A');
    });

    it('should restore filterOverrides from snapshot when cancelEditMode restores', () => {
      const widgetA = makeWidget('w-1', 'dash-a');

      // Initialize with a server-side date range
      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widgetA], '-30d', '2026-03-02');
      useDashboardStore.getState().enterEditMode();

      // Change date range during editing
      useDashboardStore.getState().setDateRange('-7d', '2026-03-02');
      expect(useDashboardStore.getState().filterOverrides.dateFrom).toBe('-7d');

      useDashboardStore.getState().cancelEditMode();

      // Should restore to the snapshotted value (the original server date range)
      const state = useDashboardStore.getState();
      expect(state.filterOverrides.dateFrom).toBe('-30d');
      expect(state.filterOverrides.dateTo).toBe('2026-03-02');
    });

    it('should restore null filterOverrides from snapshot when original was null', () => {
      const widgetA = makeWidget('w-1', 'dash-a');

      // Initialize without date range (per-widget)
      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widgetA]);
      useDashboardStore.getState().enterEditMode();

      // Set a date range during editing
      useDashboardStore.getState().setDateRange('2025-01-01', '2025-02-01');
      expect(useDashboardStore.getState().filterOverrides.dateFrom).toBe('2025-01-01');

      useDashboardStore.getState().cancelEditMode();

      // Should restore to EMPTY (null/null) since that was the original
      const state = useDashboardStore.getState();
      expect(state.filterOverrides).toEqual(EMPTY_OVERRIDES);
    });
  });

  describe('enterEditMode snapshots filterOverrides', () => {
    it('should include filterOverrides in snapshot', () => {
      const widget = makeWidget('w-1', 'dash-a');
      useDashboardStore.getState().initSession('dash-a', 'Dashboard', [widget], '-90d', '2026-03-02');

      useDashboardStore.getState().enterEditMode();

      const state = useDashboardStore.getState();
      expect(state.snapshot).not.toBeNull();
      expect(state.snapshot!.filterOverrides.dateFrom).toBe('-90d');
      expect(state.snapshot!.filterOverrides.dateTo).toBe('2026-03-02');
    });
  });

  describe('exitEditModeAfterSave keeps filterOverrides', () => {
    it('should not reset filterOverrides after save', () => {
      const widget = makeWidget('w-1', 'dash-a');
      useDashboardStore.getState().initSession('dash-a', 'Dashboard', [widget]);
      useDashboardStore.getState().enterEditMode();
      useDashboardStore.getState().setDateRange('-7d', '2026-03-02');

      useDashboardStore.getState().exitEditModeAfterSave();

      const state = useDashboardStore.getState();
      expect(state.isEditing).toBe(false);
      expect(state.isDirty).toBe(false);
      // filterOverrides should persist after save
      expect(state.filterOverrides.dateFrom).toBe('-7d');
      expect(state.filterOverrides.dateTo).toBe('2026-03-02');
    });
  });

  describe('replaceWidgetId', () => {
    it('should replace temp ID with server ID in localWidgets and localLayout', () => {
      const tempWidget = makeWidget('temp-abc', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard', [tempWidget]);

      useDashboardStore.getState().replaceWidgetId('temp-abc', 'server-uuid-1');

      const state = useDashboardStore.getState();
      expect(state.localWidgets).toHaveLength(1);
      expect(state.localWidgets[0].id).toBe('server-uuid-1');
      expect(state.localLayout).toHaveLength(1);
      expect(state.localLayout[0].i).toBe('server-uuid-1');
    });

    it('should replace temp ID in widgetMeta', () => {
      useDashboardStore.getState().initSession('dash-a', 'Dashboard', []);
      useDashboardStore.getState().addTextTile('Hello');

      const stateBeforeReplace = useDashboardStore.getState();
      const tempId = stateBeforeReplace.localWidgets[0].id;
      expect(stateBeforeReplace.widgetMeta[tempId]).toBeDefined();

      useDashboardStore.getState().replaceWidgetId(tempId, 'server-uuid-2');

      const state = useDashboardStore.getState();
      expect(state.widgetMeta['server-uuid-2']).toBeDefined();
      expect(state.widgetMeta['server-uuid-2'].textContent).toBe('Hello');
      expect(state.widgetMeta[tempId]).toBeUndefined();
    });

    it('should replace temp ID in snapshot when editing', () => {
      const tempWidget = makeWidget('temp-abc', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard', [tempWidget]);
      useDashboardStore.getState().enterEditMode();

      useDashboardStore.getState().replaceWidgetId('temp-abc', 'server-uuid-3');

      const state = useDashboardStore.getState();
      expect(state.snapshot).not.toBeNull();
      expect(state.snapshot!.widgets[0].id).toBe('server-uuid-3');
      expect(state.snapshot!.layout[0].i).toBe('server-uuid-3');
    });

    it('should not affect other widgets when replacing an ID', () => {
      const widget1 = makeWidget('w-1', 'dash-a');
      const widget2 = makeWidget('temp-abc', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard', [widget1, widget2]);

      useDashboardStore.getState().replaceWidgetId('temp-abc', 'server-uuid-4');

      const state = useDashboardStore.getState();
      expect(state.localWidgets).toHaveLength(2);
      expect(state.localWidgets[0].id).toBe('w-1');
      expect(state.localWidgets[1].id).toBe('server-uuid-4');
    });
  });
});
