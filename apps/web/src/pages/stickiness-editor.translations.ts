import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    backLabel: 'Insights',
    placeholder: 'Untitled stickiness',
    defaultName: 'Untitled stickiness',
    configureTitle: 'Configure your stickiness',
    configureDescription: 'Select a target event to see stickiness data',
    noResultsTitle: 'No results found',
    noResultsDescription: 'No events match in the selected date range',
    totalUsers: 'Total users',
    mostCommon: 'Most common',
    totalPeriods: 'Total periods',
  },
  ru: {
    backLabel: 'Инсайты',
    placeholder: 'Новый stickiness',
    defaultName: 'Новый stickiness',
    configureTitle: 'Настройте stickiness',
    configureDescription: 'Выберите целевое событие, чтобы увидеть данные о вовлечённости',
    noResultsTitle: 'Результатов не найдено',
    noResultsDescription: 'Нет событий за выбранный период',
    totalUsers: 'Всего пользователей',
    mostCommon: 'Чаще всего',
    totalPeriods: 'Всего периодов',
  },
});
