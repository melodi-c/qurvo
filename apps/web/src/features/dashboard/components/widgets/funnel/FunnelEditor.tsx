import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FunnelStepBuilder } from './FunnelStepBuilder';
import type { FunnelWidgetConfig } from '@/features/dashboard/types';

interface FunnelEditorProps {
  initialConfig: FunnelWidgetConfig;
  initialName: string;
  onSave: (config: FunnelWidgetConfig, name: string) => void;
  onCancel: () => void;
}

function defaultConfig(): FunnelWidgetConfig {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return {
    type: 'funnel',
    steps: [
      { event_name: '', label: 'Step 1' },
      { event_name: '', label: 'Step 2' },
    ],
    conversion_window_days: 14,
    date_from: from,
    date_to: to,
  };
}

export function FunnelEditor({ initialConfig, initialName, onSave, onCancel }: FunnelEditorProps) {
  const [name, setName] = useState(initialName);
  const [config, setConfig] = useState<FunnelWidgetConfig>(
    initialConfig.steps.length > 0 ? initialConfig : defaultConfig(),
  );

  const isValid =
    name.trim() !== '' &&
    config.steps.length >= 2 &&
    config.steps.every((s) => s.event_name.trim() !== '');

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block font-medium">Widget Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Signup Funnel"
        />
      </div>

      <FunnelStepBuilder
        steps={config.steps}
        onChange={(steps) => setConfig((c) => ({ ...c, steps }))}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block font-medium">From</label>
          <Input
            type="date"
            value={config.date_from.slice(0, 10)}
            onChange={(e) => setConfig((c) => ({ ...c, date_from: e.target.value }))}
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block font-medium">To</label>
          <Input
            type="date"
            value={config.date_to.slice(0, 10)}
            onChange={(e) => setConfig((c) => ({ ...c, date_to: e.target.value }))}
            className="text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block font-medium">
          Conversion Window (days)
        </label>
        <Input
          type="number"
          min={1}
          max={90}
          value={config.conversion_window_days}
          onChange={(e) =>
            setConfig((c) => ({ ...c, conversion_window_days: Number(e.target.value) }))
          }
          className="text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block font-medium">
          Breakdown by property{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          value={config.breakdown_property || ''}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              breakdown_property: e.target.value || undefined,
            }))
          }
          placeholder="e.g. country, device_type, properties.plan"
          className="text-sm"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          onClick={() => onSave(config, name.trim())}
          disabled={!isValid}
          size="sm"
        >
          Apply
        </Button>
        <Button variant="ghost" onClick={onCancel} size="sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}
