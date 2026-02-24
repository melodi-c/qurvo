import { Layers } from 'lucide-react';
import { TargetEventQueryPanel } from '../shared/TargetEventQueryPanel';
import type { StickinessWidgetConfig } from '@/api/generated/Api';

interface StickinessQueryPanelProps {
  config: StickinessWidgetConfig;
  onChange: (config: StickinessWidgetConfig) => void;
}

export function StickinessQueryPanel({ config, onChange }: StickinessQueryPanelProps) {
  return (
    <TargetEventQueryPanel
      config={config}
      onChange={onChange}
      eventIcon={Layers}
    />
  );
}
