import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Ingestion Warnings',
    description: 'Events that were dropped during ingestion due to validation errors.',
    noWarnings: 'No ingestion warnings',
    noWarningsDescription: 'All events are being ingested successfully.',
    type: 'Type',
    details: 'Details',
    timestamp: 'Time',
    typeInvalidEvent: 'Invalid event',
    typeIllegalDistinctId: 'Illegal distinct ID',
    typeUnknown: 'Unknown',
    loadError: 'Failed to load ingestion warnings',
    retry: 'Retry',
  },
  ru: {
    title: 'Предупреждения приёма',
    description: 'События, отброшенные при приёме из-за ошибок валидации.',
    noWarnings: 'Нет предупреждений',
    noWarningsDescription: 'Все события принимаются успешно.',
    type: 'Тип',
    details: 'Детали',
    timestamp: 'Время',
    typeInvalidEvent: 'Неверное событие',
    typeIllegalDistinctId: 'Недопустимый distinct ID',
    typeUnknown: 'Неизвестно',
    loadError: 'Не удалось загрузить предупреждения',
    retry: 'Повторить',
  },
});
