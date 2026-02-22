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
import { PropertyNameCombobox } from '@/features/dashboard/components/widgets/funnel/PropertyNameCombobox';
import { useEventPropertyNames } from '@/hooks/use-event-property-names';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useUEConfig, useUpsertUEConfig } from '../hooks/use-ue-config';
import type { UpsertUEConfig } from '@/api/generated/Api';
import translations from './SettingsTab.translations';

const CURRENCIES = [
  { label: 'USD ($)', value: 'USD' },
  { label: 'EUR (\u20AC)', value: 'EUR' },
  { label: 'RUB (\u20BD)', value: 'RUB' },
  { label: 'GBP (\u00A3)', value: 'GBP' },
  { label: 'KZT (\u20B8)', value: 'KZT' },
];

export function SettingsTab() {
  const { t } = useLocalTranslation(translations);
  const { data: config, isLoading } = useUEConfig();
  const upsertMutation = useUpsertUEConfig();

  const [form, setForm] = useState<UpsertUEConfig>({
    purchase_event_name: '',
    revenue_property: 'revenue',
    currency: 'USD',
    churn_window_days: 30,
  });

  const [dirty, setDirty] = useState(false);
  const { data: propertyNames = [], descriptions: propDescriptions } = useEventPropertyNames(form.purchase_event_name || undefined);

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
    toast.success(t('settingsSaved'));
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
          title={t('configureTitle')}
          description={t('configureDescription')}
        />
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t('purchaseEventName')}</Label>
          <p className="text-xs text-muted-foreground">
            {t('purchaseEventHint')}
          </p>
          <EventNameCombobox
            value={form.purchase_event_name ?? ''}
            onChange={(v) => updateField('purchase_event_name', v)}
            placeholder={t('selectEvent')}
            className="h-9 border border-border rounded-md bg-background px-3 font-sans"
          />
        </div>

        <div className="space-y-2">
          <Label>{t('revenueProperty')}</Label>
          <p className="text-xs text-muted-foreground">
            {t('revenuePropertyHint')}
          </p>
          <PropertyNameCombobox
            value={form.revenue_property ?? ''}
            onChange={(v) => updateField('revenue_property', v)}
            propertyNames={propertyNames}
            descriptions={propDescriptions}
            className="h-9 w-full border border-border rounded-md bg-background px-3 text-sm font-sans"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('currency')}</Label>
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
            <Label htmlFor="ue-churn-window">{t('churnWindow')}</Label>
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
        {upsertMutation.isPending ? t('saving') : t('saveSettings')}
      </Button>
    </div>
  );
}
