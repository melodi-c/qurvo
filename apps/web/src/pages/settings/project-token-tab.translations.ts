import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    tokenLabel: 'Project Token',
    tokenDescription: 'Use this token in your SDK configuration. It is public by nature — it will be visible in your client-side JavaScript code.',
    copyFailed: 'Failed to copy to clipboard',
    copySuccess: 'Token copied to clipboard',
    sdkGuideTitle: 'SDK Installation Guide',
    installStep: 'Install the SDK',
    installDescription: 'Add the Qurvo SDK to your project:',
    initStep: 'Initialise',
    initDescription: 'Import and initialise the SDK with your project token:',
    trackStep: 'Track events',
    trackDescription: 'Call track() to send custom events:',
  },
  ru: {
    tokenLabel: 'Токен проекта',
    tokenDescription: 'Используйте этот токен в конфигурации SDK. Он публичен по природе — он будет виден в клиентском JavaScript-коде.',
    copyFailed: 'Не удалось скопировать в буфер обмена',
    copySuccess: 'Токен скопирован в буфер обмена',
    sdkGuideTitle: 'Руководство по установке SDK',
    installStep: 'Установите SDK',
    installDescription: 'Добавьте Qurvo SDK в ваш проект:',
    initStep: 'Инициализация',
    initDescription: 'Импортируйте и инициализируйте SDK с токеном проекта:',
    trackStep: 'Отслеживание событий',
    trackDescription: 'Вызывайте track() для отправки пользовательских событий:',
  },
});
