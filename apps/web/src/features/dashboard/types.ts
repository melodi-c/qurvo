// ── Generated API types (single source of truth) ────────────────────────────
export type {
  StepFilter,
  FunnelStep,
  FunnelWidgetConfig,
  WidgetLayout,
  Widget,
  Dashboard,
  DashboardWithWidgets,
  FunnelStepResult,
  FunnelResult,
  FunnelResponse,
  StepFilterDtoOperatorEnum as FilterOperator,
} from '@/api/generated/Api';

// ── Aliases ──────────────────────────────────────────────────────────────────
import type { FunnelWidgetConfig, FunnelResponse, FunnelResult } from '@/api/generated/Api';

export type WidgetType = 'funnel';
export type WidgetConfig = FunnelWidgetConfig;
export type FunnelData = FunnelResult;
export type FunnelCacheEntry = FunnelResponse;

// ── Frontend-only types ──────────────────────────────────────────────────────

/** Minimal react-grid-layout item shape used in the dashboard store. */
export interface RglItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
