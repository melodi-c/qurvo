import { HeartPulse } from 'lucide-react';
import { TargetEventQueryPanel } from '../shared/TargetEventQueryPanel';
import type { LifecycleWidgetConfig } from '@/api/generated/Api';

interface LifecycleQueryPanelProps {
  config: LifecycleWidgetConfig;
  onChange: (config: LifecycleWidgetConfig) => void;
}

export function LifecycleQueryPanel({ config, onChange }: LifecycleQueryPanelProps) {
  return (
    <TargetEventQueryPanel
      config={config}
      onChange={onChange}
      eventIcon={HeartPulse}
    />
  );
}
