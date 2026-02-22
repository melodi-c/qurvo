import { useDashboardStore } from '../store';
import { FunnelWidget } from './widgets/funnel/FunnelWidget';
import { TrendWidget } from './widgets/trend/TrendWidget';
import { RetentionWidget } from './widgets/retention/RetentionWidget';
import { LifecycleWidget } from './widgets/lifecycle/LifecycleWidget';
import { StickinessWidget } from './widgets/stickiness/StickinessWidget';
import { PathsWidget } from './widgets/paths/PathsWidget';
import { TextTileViz } from './widgets/TextTileViz';
import type { Widget } from '@/api/generated/Api';

interface InsightCardVizProps {
  widget: Widget;
  configOverride?: Record<string, any>;
}

export function InsightCardViz({ widget, configOverride }: InsightCardVizProps) {
  const widgetMeta = useDashboardStore((s) => s.widgetMeta[widget.id]);
  const isEditing = useDashboardStore((s) => s.isEditing);

  // Text tile
  if (!widget.insight) {
    return (
      <TextTileViz
        widgetId={widget.id}
        content={widgetMeta?.textContent ?? ''}
        isEditing={isEditing}
      />
    );
  }

  // Insight tile — apply config override if present
  const effectiveWidget: Widget = configOverride
    ? { ...widget, insight: { ...widget.insight!, config: configOverride as any } }
    : widget;

  const type = widget.insight.type;

  if (type === 'trend') return <TrendWidget widget={effectiveWidget} />;
  if (type === 'funnel') return <FunnelWidget widget={effectiveWidget} />;
  if (type === 'retention') return <RetentionWidget widget={effectiveWidget} />;
  if (type === 'lifecycle') return <LifecycleWidget widget={effectiveWidget} />;
  if (type === 'stickiness') return <StickinessWidget widget={effectiveWidget} />;
  if (type === 'paths') return <PathsWidget widget={effectiveWidget} />;

  return null;
}
