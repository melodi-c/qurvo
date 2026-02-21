import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { EventNameCombobox } from '@/features/dashboard/components/widgets/funnel/EventNameCombobox';
import { useUEConfig, useUpsertUEConfig } from '../hooks/use-ue-config';
import type { UpsertUEConfig } from '@/api/generated/Api';

const CURRENCIES = [
  { label: 'USD ($)', value: 'USD' },
  { label: 'EUR (\u20AC)', value: 'EUR' },
  { label: 'RUB (\u20BD)', value: 'RUB' },
  { label: 'GBP (\u00A3)', value: 'GBP' },
  { label: 'KZT (\u20B8)', value: 'KZT' },
];

export function SettingsTab() {
  const { data: config, isLoading } = useUEConfig();
  const upsertMutation = useUpsertUEConfig();

  const [form, setForm] = useState<UpsertUEConfig>({
    purchase_event_name: '',
    revenue_property: 'revenue',
    currency: 'USD',
    churn_window_days: 30,
  });

  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        purchase_event_name: config.purchase_event_name ?? '',
        revenue_property: config.revenue_property ?? 'revenue',
        currency: config.currency ?? 'USD',
        churn_window_days: config.churn_window_days ?? 30,
      });
      setDirty(false);
    }
  }, [config]);

  const updateField = useCallback(<K extends keyof UpsertUEConfig>(key: K, value: UpsertUEConfig[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    await upsertMutation.mutateAsync(form);
    toast.success('Settings saved');
    setDirty(false);
  }, [form, upsertMutation]);

  if (isLoading) {
    return (
      <div className="max-w-lg space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      {!config && (
        <EmptyState
          icon={Settings}
          title="Configure Unit Economics"
          description="Set the purchase event name to start calculating metrics. Other fields have sensible defaults."
        />
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Purchase Event Name</Label>
          <p className="text-xs text-muted-foreground">
            The event that represents a purchase (e.g. "purchase", "order_completed")
          </p>
          <EventNameCombobox
            value={form.purchase_event_name ?? ''}
            onChange={(v) => updateField('purchase_event_name', v)}
            placeholder="Select event..."
            className="h-9 border border-border rounded-md bg-background px-3 font-sans"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ue-revenue-prop">Revenue Property</Label>
          <p className="text-xs text-muted-foreground">
            The property key in event properties that contains the revenue amount
          </p>
          <Input
            id="ue-revenue-prop"
            value={form.revenue_property ?? ''}
            onChange={(e) => updateField('revenue_property', e.target.value)}
            placeholder="revenue"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select
              value={form.currency ?? 'USD'}
              onValueChange={(v) => updateField('currency', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ue-churn-window">Churn Window (days)</Label>
            <Input
              id="ue-churn-window"
              type="number"
              min={7}
              max={365}
              value={form.churn_window_days ?? 30}
              onChange={(e) => updateField('churn_window_days', parseInt(e.target.value) || 30)}
            />
          </div>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={!form.purchase_event_name?.trim() || !dirty || upsertMutation.isPending}
      >
        {upsertMutation.isPending ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}
