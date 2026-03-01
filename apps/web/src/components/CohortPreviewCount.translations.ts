import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    addConditionsTitle: 'Add conditions to preview',
    addConditionsDescription: 'Configure conditions on the left to see matching users count',
    calculating: 'Calculating...',
    personsMatch: 'persons match',
    previewPlaceholder: 'Preview will appear here',
    viewerNoPreview: 'Preview requires editor access',
    previewError: 'Failed to preview cohort',
    currentMembers: 'current members',
  },
  ru: {
    addConditionsTitle: 'Добавьте условия для предпросмотра',
    addConditionsDescription: 'Настройте условия слева, чтобы увидеть количество подходящих пользователей',
    calculating: 'Вычисление...',
    personsMatch: 'пользователей соответствуют',
    previewPlaceholder: 'Предпросмотр появится здесь',
    viewerNoPreview: 'Предпросмотр доступен только редакторам',
    previewError: 'Не удалось получить предпросмотр',
    currentMembers: 'участников сейчас',
  },
});
