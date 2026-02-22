import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    backLabel: 'Insights',
    placeholder: 'Untitled retention',
    defaultName: 'Untitled retention',
    configureTitle: 'Configure your retention',
    configureDescription: 'Select a target event to see retention data',
    noResultsTitle: 'No results found',
    noResultsDescription: 'No events match in the selected date range',
    cohorts: 'Cohorts',
    avgDay1Retention: 'Avg Day 1 Retention',
  },
  ru: {
    backLabel: 'Инсайты',
    placeholder: 'Новый retention',
    defaultName: 'Новый retention',
    configureTitle: 'Настройте retention',
    configureDescription: 'Выберите целевое событие, чтобы увидеть данные об удержании',
    noResultsTitle: 'Результатов не найдено',
    noResultsDescription: 'Нет событий за выбранный период',
    cohorts: 'Когорты',
    avgDay1Retention: 'Сред. удержание День 1',
  },
});
