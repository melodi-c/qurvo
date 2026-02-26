import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './channel-config-section.translations';

export type ChannelType = 'slack' | 'email' | 'telegram';

export interface ChannelConfigFields {
  channel_type: ChannelType;
  channel_config_value: string;
  channel_config_extra: string;
}

export interface ChannelConfigErrors {
  channel_config_value?: string;
  channel_config_extra?: string;
}

/**
 * Builds the channel_config payload from the form fields.
 */
export function buildChannelConfig(fields: ChannelConfigFields): Record<string, unknown> {
  if (fields.channel_type === 'slack') return { webhook_url: fields.channel_config_value.trim() };
  if (fields.channel_type === 'telegram') {
    return { chat_id: fields.channel_config_value.trim(), bot_token: fields.channel_config_extra.trim() };
  }
  return { email: fields.channel_config_value.trim() };
}

/**
 * Returns true when enough channel config data is filled to send a test notification.
 */
export function isChannelConfigFilled(fields: ChannelConfigFields): boolean {
  return (
    fields.channel_config_value.trim().length > 0 &&
    (fields.channel_type !== 'telegram' || fields.channel_config_extra.trim().length > 0)
  );
}

/**
 * Validates channel config fields and appends errors to the provided error map.
 * Returns true when there are no channel-related errors.
 */
export function validateChannelConfig(
  fields: ChannelConfigFields,
  errors: Record<string, string>,
  t: (key: 'validationRequired' | 'validationInvalidEmail' | 'validationInvalidUrl') => string,
): boolean {
  const before = Object.keys(errors).length;
  if (!fields.channel_config_value.trim()) {
    errors.channel_config_value = t('validationRequired');
  } else if (fields.channel_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.channel_config_value)) {
    errors.channel_config_value = t('validationInvalidEmail');
  } else if (fields.channel_type === 'slack') {
    try {
      new URL(fields.channel_config_value);
    } catch {
      errors.channel_config_value = t('validationInvalidUrl');
    }
  }
  if (fields.channel_type === 'telegram' && !fields.channel_config_extra.trim()) {
    errors.channel_config_extra = t('validationRequired');
  }
  return Object.keys(errors).length === before;
}

interface ChannelConfigSectionProps {
  values: ChannelConfigFields;
  errors?: ChannelConfigErrors;
  emailPlaceholder?: string;
  onChange: (patch: Partial<ChannelConfigFields>) => void;
}

/**
 * Shared section for selecting a notification channel type and entering its
 * configuration. Used by MonitorFormDialog and ScheduledJobFormDialog.
 */
export function ChannelConfigSection({ values, errors = {}, emailPlaceholder, onChange }: ChannelConfigSectionProps) {
  const { t } = useLocalTranslation(translations);

  const handleChannelTypeChange = (v: string) => {
    onChange({ channel_type: v as ChannelType, channel_config_value: '', channel_config_extra: '' });
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>{t('fieldChannelType')}</Label>
        <Select value={values.channel_type} onValueChange={handleChannelTypeChange}>
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
          {values.channel_type === 'slack'
            ? t('fieldSlackWebhook')
            : values.channel_type === 'telegram'
              ? t('fieldTelegramChatId')
              : t('fieldEmail')}
        </Label>
        <Input
          type={values.channel_type === 'email' ? 'email' : 'text'}
          placeholder={
            values.channel_type === 'slack'
              ? t('slackWebhookPlaceholder')
              : values.channel_type === 'telegram'
                ? t('telegramChatIdPlaceholder')
                : (emailPlaceholder ?? t('fieldEmail'))
          }
          value={values.channel_config_value}
          onChange={(e) => onChange({ channel_config_value: e.target.value })}
        />
        {errors.channel_config_value && (
          <p className="text-xs text-destructive">{errors.channel_config_value}</p>
        )}
      </div>

      {values.channel_type === 'telegram' && (
        <div className="space-y-1.5">
          <Label>{t('fieldTelegramBotToken')}</Label>
          <Input
            type="text"
            placeholder={t('telegramBotTokenPlaceholder')}
            value={values.channel_config_extra}
            onChange={(e) => onChange({ channel_config_extra: e.target.value })}
          />
          {errors.channel_config_extra && (
            <p className="text-xs text-destructive">{errors.channel_config_extra}</p>
          )}
        </div>
      )}
    </>
  );
}
