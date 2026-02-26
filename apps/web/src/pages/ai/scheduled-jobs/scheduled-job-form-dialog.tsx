import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { ChannelConfigSection, buildChannelConfig, isChannelConfigFilled, validateChannelConfig } from '@/components/ui/channel-config-section';
import type { ChannelConfigFields } from '@/components/ui/channel-config-section';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useCreateScheduledJob, useUpdateScheduledJob } from '@/features/ai-scheduled-jobs/use-scheduled-jobs';
import type { AiScheduledJob } from '@/api/generated/Api';
import { api } from '@/api/client';
import type { TestNotificationDtoChannelTypeEnum } from '@/api/generated/Api';
import { extractApiErrorMessage } from '@/lib/utils';
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
  const testMutation = useMutation({
    mutationFn: (payload: { channel_type: TestNotificationDtoChannelTypeEnum; channel_config: Record<string, unknown> }) =>
      api.notificationsControllerTestNotification({ projectId }, payload),
    onSuccess: () => toast.success(t('testSuccess')),
    onError: (err) => toast.error(extractApiErrorMessage(err, t('testError'))),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleOpen = useCallback((next: boolean) => {
    if (!next) {
      setForm(getInitialState(job));
      setErrors({});
    }
    onOpenChange(next);
  }, [job, onOpenChange]);

  const channelFields: ChannelConfigFields = {
    channel_type: form.channel_type,
    channel_config_value: form.channel_config_value,
    channel_config_extra: form.channel_config_extra,
  };

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t('validationRequired');
    if (!form.prompt.trim()) next.prompt = t('validationRequired');
    validateChannelConfig(channelFields, next, t);
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, channelFields, t]);

  const handleTest = useCallback(() => {
    testMutation.mutate({
      channel_type: form.channel_type as TestNotificationDtoChannelTypeEnum,
      channel_config: buildChannelConfig(channelFields),
    });
  }, [testMutation, form.channel_type, channelFields]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    const payload = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      schedule: form.schedule,
      channel_type: form.channel_type,
      channel_config: buildChannelConfig(channelFields),
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
  }, [validate, form, channelFields, isEdit, job, createMutation, updateMutation, t, handleOpen]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editJob') : t('createJob')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto min-h-0">
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
            <Label className="flex items-center gap-1.5">
              {t('fieldPrompt')}
              <InfoTooltip content={t('promptTooltip')} />
            </Label>
            <Textarea
              value={form.prompt}
              onChange={(e) => setForm((s) => ({ ...s, prompt: e.target.value }))}
              rows={4}
              placeholder={t('promptPlaceholder')}
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

          <ChannelConfigSection
            values={channelFields}
            errors={errors}
            emailPlaceholder={t('emailReportPlaceholder')}
            onChange={(patch) => setForm((s) => ({ ...s, ...patch }))}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isPending || testMutation.isPending || !isChannelConfigFilled(channelFields)}
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
