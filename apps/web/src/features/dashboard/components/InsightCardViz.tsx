import type { ComponentType } from 'react';
import { useDashboardStore } from '../store';
import { FunnelWidget } from './widgets/funnel/FunnelWidget';
import { TrendWidget } from './widgets/trend/TrendWidget';
import { RetentionWidget } from './widgets/retention/RetentionWidget';
import { LifecycleWidget } from './widgets/lifecycle/LifecycleWidget';
import { StickinessWidget } from './widgets/stickiness/StickinessWidget';
import { PathsWidget } from './widgets/paths/PathsWidget';
import { TextTileViz } from './widgets/TextTileViz';
import type { Widget, Insight, InsightType } from '@/api/generated/Api';

interface InsightCardVizProps {
  widget: Widget;
  configOverride?: Insight['config'];
}

const WIDGET_MAP: Record<InsightType, ComponentType<{ widget: Widget }>> = {
  trend: TrendWidget,
  funnel: FunnelWidget,
  retention: RetentionWidget,
  lifecycle: LifecycleWidget,
  stickiness: StickinessWidget,
  paths: PathsWidget,
};

export function InsightCardViz({ widget, configOverride }: InsightCardVizProps) {
  const widgetMeta = useDashboardStore((s) => s.widgetMeta[widget.id]);
  const isEditing = useDashboardStore((s) => s.isEditing);

  // Text tile
  if (!widget.insight) {
    return (
      <TextTileViz
        widgetId={widget.id}
        content={widgetMeta?.textContent ?? widget.content ?? ''}
        isEditing={isEditing}
      />
    );
  }

  // Insight tile — apply config override if present
  const effectiveWidget: Widget = configOverride
    ? { ...widget, insight: { ...widget.insight!, config: configOverride } }
    : widget;

  const Component = WIDGET_MAP[widget.insight.type];
  return Component ? <Component widget={effectiveWidget} /> : null;
}
