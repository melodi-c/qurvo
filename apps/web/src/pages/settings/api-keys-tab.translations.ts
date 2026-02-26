import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    tokenLabel: 'Project Token',
    tokenDescription: 'Use this token in your SDK configuration. It is public by nature \u2014 it will be visible in your client-side JavaScript code.',
    copyFailed: 'Failed to copy to clipboard',
  },
  ru: {
    tokenLabel: 'Токен проекта',
    tokenDescription: 'Используйте этот токен в конфигурации SDK. Он публичен по природе \u2014 он будет виден в клиентском JavaScript-коде.',
    copyFailed: 'Не удалось скопировать в буфер обмена',
  },
});
