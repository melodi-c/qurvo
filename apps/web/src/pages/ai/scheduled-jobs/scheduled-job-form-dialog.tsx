import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useCreateScheduledJob, useUpdateScheduledJob } from '@/features/ai-scheduled-jobs/use-scheduled-jobs';
import type { AiScheduledJob } from '@/api/generated/Api';
import translations from './scheduled-jobs.translations';

interface JobFormState {
  name: string;
  prompt: string;
  schedule: 'daily' | 'weekly' | 'monthly';
  channel_type: 'slack' | 'email' | 'telegram';
  channel_config_value: string;
  channel_config_extra: string;
  is_active: boolean;
}

interface ScheduledJobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  job?: AiScheduledJob;
}

function getInitialState(job?: AiScheduledJob): JobFormState {
  if (job) {
    const config = job.channel_config as Record<string, string>;
    const channelType = job.channel_type as 'slack' | 'email' | 'telegram';
    return {
      name: job.name,
      prompt: job.prompt,
      schedule: job.schedule,
      channel_type: channelType,
      channel_config_value:
        channelType === 'slack'
          ? (config.webhook_url ?? '')
          : channelType === 'telegram'
            ? (config.chat_id ?? '')
            : (config.email ?? ''),
      channel_config_extra: channelType === 'telegram' ? (config.bot_token ?? '') : '',
      is_active: job.is_active,
    };
  }
  return {
    name: '',
    prompt: '',
    schedule: 'daily',
    channel_type: 'slack',
    channel_config_value: '',
    channel_config_extra: '',
    is_active: true,
  };
}

export function ScheduledJobFormDialog({ open, onOpenChange, projectId, job }: ScheduledJobFormDialogProps) {
  const { t } = useLocalTranslation(translations);
  const isEdit = !!job;

  const [form, setForm] = useState<JobFormState>(() => getInitialState(job));
  const [errors, setErrors] = useState<Partial<Record<keyof JobFormState, string>>>({});

  const createMutation = useCreateScheduledJob(projectId);
  const updateMutation = useUpdateScheduledJob(projectId);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleOpen = useCallback((next: boolean) => {
    if (!next) {
      setForm(getInitialState(job));
      setErrors({});
    }
    onOpenChange(next);
  }, [job, onOpenChange]);

  const validate = useCallback((): boolean => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = t('validationRequired');
    if (!form.prompt.trim()) next.prompt = t('validationRequired');
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

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    const channelConfig =
      form.channel_type === 'slack'
        ? { webhook_url: form.channel_config_value.trim() }
        : form.channel_type === 'telegram'
          ? { chat_id: form.channel_config_value.trim(), bot_token: form.channel_config_extra.trim() }
          : { email: form.channel_config_value.trim() };

    const payload = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      schedule: form.schedule,
      channel_type: form.channel_type,
      channel_config: channelConfig,
    };

    try {
      if (isEdit && job) {
        await updateMutation.mutateAsync({ jobId: job.id, data: { ...payload, is_active: form.is_active } });
      } else {
        await createMutation.mutateAsync(payload);
      }
      toast.success(t('saved'));
      handleOpen(false);
    } catch {
      // error handled by mutation
    }
  }, [validate, form, isEdit, job, createMutation, updateMutation, t, handleOpen]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editJob') : t('createJob')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('fieldName')}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              maxLength={255}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t('fieldPrompt')}</Label>
            <Textarea
              value={form.prompt}
              onChange={(e) => setForm((s) => ({ ...s, prompt: e.target.value }))}
              rows={4}
              placeholder="e.g. Summarize the top events and user trends from the past week"
            />
            {errors.prompt && <p className="text-xs text-destructive">{errors.prompt}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t('fieldSchedule')}</Label>
            <Select
              value={form.schedule}
              onValueChange={(v) => setForm((s) => ({ ...s, schedule: v as 'daily' | 'weekly' | 'monthly' }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{t('scheduleDaily')}</SelectItem>
                <SelectItem value="weekly">{t('scheduleWeekly')}</SelectItem>
                <SelectItem value="monthly">{t('scheduleMonthly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('fieldChannelType')}</Label>
            <Select
              value={form.channel_type}
              onValueChange={(v) => setForm((s) => ({ ...s, channel_type: v as 'slack' | 'email' | 'telegram', channel_config_value: '', channel_config_extra: '' }))}
            >
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
                  ? 'https://hooks.slack.com/services/...'
                  : form.channel_type === 'telegram'
                    ? '-1001234567890'
                    : 'reports@example.com'
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
