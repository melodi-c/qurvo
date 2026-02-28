type ChannelTranslationKey = 'channelSlack' | 'channelTelegram' | 'channelEmail';
type TFunc = (key: ChannelTranslationKey) => string;

/**
 * Returns a localised label for a notification channel type.
 * Expects the translation keys `channelSlack`, `channelTelegram`, `channelEmail`
 * to be defined in the caller's translation map.
 */
export function getChannelTypeLabel(channelType: string, t: TFunc): string {
  if (channelType === 'slack') {return t('channelSlack');}
  if (channelType === 'telegram') {return t('channelTelegram');}
  return t('channelEmail');
}
