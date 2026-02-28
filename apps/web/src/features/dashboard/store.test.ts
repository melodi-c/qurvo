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
      widgetMeta: {},
      snapshot: null,
    });
  });

  describe('cancelEditMode race condition guard', () => {
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

    it('should reset filterOverrides when cancelEditMode restores snapshot', () => {
      const widgetA = makeWidget('w-1', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widgetA]);
      useDashboardStore.getState().enterEditMode();
      useDashboardStore.getState().setFilterOverrides({ dateFrom: '2025-01-01', dateTo: '2025-02-01' });

      // Verify overrides are set
      expect(useDashboardStore.getState().filterOverrides.dateFrom).toBe('2025-01-01');

      useDashboardStore.getState().cancelEditMode();

      const state = useDashboardStore.getState();
      expect(state.filterOverrides).toEqual(EMPTY_OVERRIDES);
    });

    it('should reset filterOverrides when cancelEditMode has no snapshot', () => {
      const widgetA = makeWidget('w-1', 'dash-a');

      useDashboardStore.getState().initSession('dash-a', 'Dashboard A', [widgetA]);
      // Not editing, but set some filter overrides
      useDashboardStore.getState().setFilterOverrides({ dateFrom: '2025-01-01' });

      useDashboardStore.getState().cancelEditMode('dash-a');

      const state = useDashboardStore.getState();
      expect(state.filterOverrides).toEqual(EMPTY_OVERRIDES);
    });
  });
});
