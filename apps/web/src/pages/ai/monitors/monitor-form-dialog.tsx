import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useCreateMonitor, useUpdateMonitor } from '@/features/ai-monitors/use-monitors';
import type { AiMonitor } from '@/features/ai-monitors/use-monitors';
import { api } from '@/api/client';
import type { TestNotificationDtoChannelTypeEnum } from '@/api/generated/Api';
import { extractApiErrorMessage } from '@/lib/utils';
import translations from './monitors.translations';

interface MonitorFormState {
  event_name: string;
  metric: 'count' | 'unique_users';
  threshold_sigma: string;
  channel_type: 'slack' | 'email' | 'telegram';
  channel_config_value: string;
  channel_config_extra: string;
  is_active: boolean;
}

interface MonitorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  monitor?: AiMonitor;
}

function getInitialState(monitor?: AiMonitor): MonitorFormState {
  if (monitor) {
    const config = monitor.channel_config as Record<string, string>;
    const channelType = monitor.channel_type as 'slack' | 'email' | 'telegram';
    return {
      event_name: monitor.event_name,
      metric: monitor.metric as 'count' | 'unique_users',
      threshold_sigma: String(monitor.threshold_sigma),
      channel_type: channelType,
      channel_config_value:
        channelType === 'slack'
          ? (config.webhook_url ?? '')
          : channelType === 'telegram'
            ? (config.chat_id ?? '')
            : (config.email ?? ''),
      channel_config_extra: channelType === 'telegram' ? (config.bot_token ?? '') : '',
      is_active: monitor.is_active,
    };
  }
  return {
    event_name: '',
    metric: 'count',
    threshold_sigma: '2',
    channel_type: 'slack',
    channel_config_value: '',
    channel_config_extra: '',
    is_active: true,
  };
}

export function MonitorFormDialog({ open, onOpenChange, projectId, monitor }: MonitorFormDialogProps) {
  const { t } = useLocalTranslation(translations);
  const isEdit = !!monitor;

  const [form, setForm] = useState<MonitorFormState>(() => getInitialState(monitor));
  const [errors, setErrors] = useState<Partial<Record<keyof MonitorFormState, string>>>({});

  const createMutation = useCreateMonitor(projectId);
  const updateMutation = useUpdateMonitor(projectId);
  const testMutation = useMutation({
    mutationFn: (payload: { channel_type: TestNotificationDtoChannelTypeEnum; channel_config: Record<string, unknown> }) =>
      api.notificationsControllerTestNotification({ projectId }, payload),
    onSuccess: () => toast.success(t('testSuccess')),
    onError: (err) => toast.error(extractApiErrorMessage(err, t('testError'))),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleOpen = useCallback((next: boolean) => {
    if (!next) {
      setForm(getInitialState(monitor));
      setErrors({});
    }
    onOpenChange(next);
  }, [monitor, onOpenChange]);

  const validate = useCallback((): boolean => {
    const next: typeof errors = {};
    if (!form.event_name.trim()) next.event_name = t('validationRequired');
    if (!form.channel_config_value.trim()) next.channel_config_value = t('validationRequired');
    if (form.channel_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.channel_config_value)) {
      next.channel_config_value = t('validationInvalidEmail');
    }
    if (form.channel_type === 'slack') {
      try { new URL(form.channel_config_value); } catch {
        next.channel_config_value = t('validationInvalidUrl');
      }
    }
    if (form.channel_type === 'telegram' && !form.channel_config_extra.trim()) {
      next.channel_config_extra = t('validationRequired');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, t]);

  const buildChannelConfig = useCallback((): Record<string, unknown> => {
    if (form.channel_type === 'slack') return { webhook_url: form.channel_config_value.trim() };
    if (form.channel_type === 'telegram') {
      return { chat_id: form.channel_config_value.trim(), bot_token: form.channel_config_extra.trim() };
    }
    return { email: form.channel_config_value.trim() };
  }, [form.channel_type, form.channel_config_value, form.channel_config_extra]);

  const isChannelConfigFilled = form.channel_config_value.trim().length > 0 &&
    (form.channel_type !== 'telegram' || form.channel_config_extra.trim().length > 0);

  const handleTest = useCallback(() => {
    testMutation.mutate({
      channel_type: form.channel_type as TestNotificationDtoChannelTypeEnum,
      channel_config: buildChannelConfig(),
    });
  }, [testMutation, form.channel_type, buildChannelConfig]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    const payload = {
      event_name: form.event_name.trim(),
      metric: form.metric,
      threshold_sigma: parseFloat(form.threshold_sigma) || 2,
      channel_type: form.channel_type,
      channel_config: buildChannelConfig(),
    };

    try {
      if (isEdit && monitor) {
        await updateMutation.mutateAsync({ monitorId: monitor.id, data: { ...payload, is_active: form.is_active } });
      } else {
        await createMutation.mutateAsync(payload);
      }
      toast.success(t('saved'));
      handleOpen(false);
    } catch {
      // error handled by mutation
    }
  }, [validate, form, isEdit, monitor, createMutation, updateMutation, t, handleOpen, buildChannelConfig]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="flex flex-col max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editMonitor') : t('createMonitor')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto min-h-0">
          <div className="space-y-1.5">
            <Label>{t('fieldEventName')}</Label>
            <EventNameCombobox
              value={form.event_name}
              onChange={(v) => setForm((s) => ({ ...s, event_name: v }))}
            />
            {errors.event_name && <p className="text-xs text-destructive">{errors.event_name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t('fieldMetric')}</Label>
            <Select value={form.metric} onValueChange={(v) => setForm((s) => ({ ...s, metric: v as 'count' | 'unique_users' }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="count">{t('metricCount')}</SelectItem>
                <SelectItem value="unique_users">{t('metricUniqueUsers')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              {t('fieldThreshold')}
              <InfoTooltip content={t('thresholdTooltip')} />
            </Label>
            <Input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={form.threshold_sigma}
              onChange={(e) => setForm((s) => ({ ...s, threshold_sigma: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('fieldChannelType')}</Label>
            <Select value={form.channel_type} onValueChange={(v) => setForm((s) => ({ ...s, channel_type: v as 'slack' | 'email' | 'telegram', channel_config_value: '', channel_config_extra: '' }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slack">{t('channelSlack')}</SelectItem>
                <SelectItem value="email">{t('channelEmail')}</SelectItem>
                <SelectItem value="telegram">{t('channelTelegram')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              {form.channel_type === 'slack'
                ? t('fieldSlackWebhook')
                : form.channel_type === 'telegram'
                  ? t('fieldTelegramChatId')
                  : t('fieldEmail')}
            </Label>
            <Input
              type={form.channel_type === 'email' ? 'email' : 'text'}
              placeholder={
                form.channel_type === 'slack'
                  ? t('slackWebhookPlaceholder')
                  : form.channel_type === 'telegram'
                    ? '-1001234567890'
                    : t('emailAlertPlaceholder')
              }
              value={form.channel_config_value}
              onChange={(e) => setForm((s) => ({ ...s, channel_config_value: e.target.value }))}
            />
            {errors.channel_config_value && <p className="text-xs text-destructive">{errors.channel_config_value}</p>}
          </div>

          {form.channel_type === 'telegram' && (
            <div className="space-y-1.5">
              <Label>{t('fieldTelegramBotToken')}</Label>
              <Input
                type="text"
                placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz"
                value={form.channel_config_extra}
                onChange={(e) => setForm((s) => ({ ...s, channel_config_extra: e.target.value }))}
              />
              {errors.channel_config_extra && <p className="text-xs text-destructive">{errors.channel_config_extra}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isPending || testMutation.isPending || !isChannelConfigFilled}
          >
            {t('sendTest')}
          </Button>
          <Button variant="outline" onClick={() => handleOpen(false)} disabled={isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isPending}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
